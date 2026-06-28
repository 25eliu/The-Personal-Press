'use client';
import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { paragraphs } from '@/lib/newspaper/blocks';
import { easeOut, linear, tween } from '@/lib/edition/tween';
import type { TGraphic, TSource, TTableData } from '@/lib/schema';

/**
 * Live-edit choreography. When the Copy Desk changes a section, we don't swap the
 * text instantly — we play "a person editing": typewriter-ERASE the old story from the
 * bottom up, all the way through its headline, HOLD a blinking caret while the new copy
 * is fetched, then TYPE the new story back in (title first, then body). The real reducer
 * dispatch is DEFERRED by the caller until the animation ends, so `pages` stays
 * byte-identical throughout and the paginator never re-measures mid-stream. BlockView
 * reads this state and renders the animating head/paragraph blocks in place.
 *
 * The animated region is modelled as an ordered segment list — headline, optional dek,
 * then body paragraphs — collapsed to a single `revealed` char counter (counting from
 * the top). Erasing tweens it total→0 (tail disappears first, headline last); typing
 * tweens 0→total (headline appears first). Per-frame work is O(1): one integer in state;
 * BlockView only slices already-computed strings.
 */
type Phase = 'idle' | 'erasing' | 'waiting' | 'typing' | 'settling';

export interface LiveEditState {
  phase: Phase;
  slot: number | null;
  articleKey: string | null; // `${topicIndex}-${articleIndex}` — matches Block.articleKey
  animateHead: boolean; // whether the headline/dek are part of this animation
  whole: boolean; // true when the ENTIRE article (chart/table/sources too) is being swapped,
  // not just the body — drives whether BlockView clears + reloads those structural blocks
  sectionScope: boolean; // true when the WHOLE section (every article on the page) is being
  // replaced — the animated lead typewriters out/in, every OTHER article in the slot collapses
  // so the entire section clears, not just its lead
  revealSlot: number | null; // after a section replace commits, the slot whose freshly-printed
  // (non-lead) articles rise in — so the new section loads via animation, not a hard repaginate
  headline: string;
  dek: string;
  paras: string[]; // body split into paragraphs (erase renders these per leaf slot)
  body: string; // raw body text (typing renders this into the first paragraph slot)
  revealed: number; // chars shown so far, counted from the top: headline → dek → body
  // The NEW story's structural content, surfaced during typing/settling so the chart,
  // table and sources load in WITH the text instead of popping when the reducer commits
  // (until then `pages` still holds the old article). Only meaningful while `whole`.
  table?: TTableData;
  graphic?: TGraphic; // the NEW graphic spec, so a 'graphic' block reloads with the text
  sources?: TSource[];
  // The NEW head's kicker/byline, streamed in during typing so the kicker label and the
  // "By …" line return WITH the headline (they also erase with it — nothing lingers).
  kicker?: string;
  byline?: string;
}

interface LiveEditController extends LiveEditState {
  /** Start an edit: erase the old story (returns its run id + an erase-complete promise). */
  begin: (opts: {
    slot: number;
    articleIndex: number;
    headline?: string;
    dek?: string;
    body: string;
    whole?: boolean; // erase the chart/table/sources too (full-article replace)
    sectionScope?: boolean; // also collapse every OTHER article on the page (whole-section replace)
  }) => { id: number; erased: Promise<void> };
  /** Type the new story in. No-op unless `id` still owns the stage. */
  type: (
    id: number,
    opts: {
      headline?: string;
      dek?: string;
      body: string;
      table?: TTableData;
      graphic?: TGraphic;
      sources?: TSource[];
      kicker?: string;
      byline?: string;
    },
  ) => Promise<void>;
  /** One-shot erase+type for callers that already have the new text (local body edits). */
  play: (opts: { slot: number; articleIndex: number; oldBody: string; newBody: string }) => Promise<void>;
  /**
   * Hand the stage back. Ignored if a newer run already owns it (pass the run id).
   * Pass `revealSlot` after a whole-section commit to rise the new (non-lead) articles in.
   */
  end: (id?: number, opts?: { revealSlot?: number }) => void;
}

const IDLE: LiveEditState = {
  phase: 'idle',
  slot: null,
  articleKey: null,
  animateHead: false,
  whole: false,
  sectionScope: false,
  revealSlot: null,
  headline: '',
  dek: '',
  paras: [],
  body: '',
  revealed: 0,
  table: undefined,
  sources: undefined,
};

const Ctx = createContext<LiveEditController | null>(null);

const prefersReduced = () =>
  typeof window !== 'undefined' &&
  typeof window.matchMedia === 'function' &&
  window.matchMedia('(prefers-reduced-motion: reduce)').matches;

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

// --- Derived slices, shared with BlockView so the math lives in one place ----------

/** The headline text revealed so far. */
export function liveHeadline(s: LiveEditState): string {
  return s.headline.slice(0, clamp(s.revealed, 0, s.headline.length));
}
/** The dek text revealed so far (after the headline). */
export function liveDek(s: LiveEditState): string {
  const after = s.revealed - s.headline.length;
  return after <= 0 ? '' : s.dek.slice(0, Math.min(s.dek.length, after));
}
/** How many BODY chars are revealed (after headline + dek). */
export function liveBodyChars(s: LiveEditState): number {
  return Math.max(0, s.revealed - s.headline.length - s.dek.length);
}
/**
 * Erasing slices the head differently from typing. The single top-down `revealed`
 * counter keeps the headline FULL until the body+dek have drained — so the title and
 * dek would only vanish in the last instant, reading as "only the body was deleted".
 * During an erase we instead shrink the head IN STEP with the overall progress
 * (1 = un-erased → 0 = gone) so the title and description visibly clear WITH the body.
 */
export function liveEraseFrac(s: LiveEditState): number {
  const total = s.headline.length + s.dek.length + s.paras.reduce((n, p) => n + p.length, 0);
  return total > 0 ? clamp(s.revealed / total, 0, 1) : 0;
}
/** The headline still showing mid-erase (proportional shrink, not a top-down slice). */
export function liveHeadlineErasing(s: LiveEditState): string {
  return s.headline.slice(0, Math.ceil(s.headline.length * liveEraseFrac(s)));
}
/** The dek still showing mid-erase (proportional shrink, in step with the headline). */
export function liveDekErasing(s: LiveEditState): string {
  return s.dek.slice(0, Math.ceil(s.dek.length * liveEraseFrac(s)));
}
/** True while the caret sits in the head block (body fully erased / not yet typed). */
export function liveCaretInHead(s: LiveEditState): boolean {
  return s.animateHead && liveBodyChars(s) <= 0;
}
/** True once the headline + dek are fully revealed (the figure sits just below them). */
export function liveHeadDone(s: LiveEditState): boolean {
  return s.revealed >= s.headline.length + s.dek.length;
}
/** True once the whole body is revealed (the table + sources sit just below it). */
export function liveBodyDone(s: LiveEditState): boolean {
  const bodyLen = s.paras.reduce((n, p) => n + p.length, 0);
  return liveBodyChars(s) >= bodyLen;
}

const eraseMs = (total: number) => Math.min(900, Math.max(280, total * 1.1));
const typeMs = (total: number) => Math.min(1600, Math.max(500, total * 5));

export function LiveEditProvider({ children }: { children: ReactNode }) {
  const [st, setSt] = useState<LiveEditState>(IDLE);
  const runId = useRef(0);
  const revealTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const end = useCallback((id?: number, opts?: { revealSlot?: number }) => {
    if (id !== undefined && id !== runId.current) return; // a newer run owns the stage
    runId.current++; // cancel any in-flight tween
    if (opts?.revealSlot != null) {
      // Commit a whole-section replace: go idle but mark the slot so its new (non-lead)
      // articles rise in, then clear that mark once the staggered reprint has played.
      const slot = opts.revealSlot;
      setSt({ ...IDLE, revealSlot: slot });
      if (revealTimer.current) clearTimeout(revealTimer.current);
      revealTimer.current = setTimeout(() => setSt((s) => ({ ...s, revealSlot: null })), 1500);
    } else {
      setSt(IDLE);
    }
  }, []);

  const begin = useCallback(
    ({
      slot,
      articleIndex,
      headline = '',
      dek = '',
      body,
      whole = false,
      sectionScope = false,
    }: {
      slot: number;
      articleIndex: number;
      headline?: string;
      dek?: string;
      body: string;
      whole?: boolean;
      sectionScope?: boolean;
    }) => {
      const id = ++runId.current;
      const articleKey = `${slot}-${articleIndex}`;
      const animateHead = Boolean(headline || dek);
      const paras = paragraphs(body);
      const total = headline.length + dek.length + paras.reduce((n, p) => n + p.length, 0);

      // Respect reduced-motion (and no-op if there's nothing to erase): the caller still
      // dispatches when the flow completes, producing an instant swap.
      if (prefersReduced() || total === 0) {
        return { id, erased: Promise.resolve() };
      }

      setSt({
        ...IDLE,
        phase: 'erasing',
        slot,
        articleKey,
        animateHead,
        whole,
        sectionScope,
        headline,
        dek,
        paras,
        body,
        revealed: total,
      });
      const erased = tween(
        total,
        0,
        eraseMs(total),
        easeOut,
        (v) => setSt((s) => ({ ...s, revealed: Math.round(v) })),
        () => runId.current !== id,
      ).then(() => {
        if (runId.current !== id) return;
        setSt((s) => ({ ...s, phase: 'waiting', revealed: 0 })); // caret holds while we fetch
      });
      return { id, erased };
    },
    [],
  );

  const type = useCallback(
    async (
      id: number,
      {
        headline = '',
        dek = '',
        body,
        table,
        graphic,
        sources,
        kicker,
        byline,
      }: {
        headline?: string;
        dek?: string;
        body: string;
        table?: TTableData;
        graphic?: TGraphic;
        sources?: TSource[];
        kicker?: string;
        byline?: string;
      },
    ) => {
      if (runId.current !== id || prefersReduced()) return;
      const animateHead = Boolean(headline || dek);
      const paras = paragraphs(body);
      const total = headline.length + dek.length + paras.reduce((n, p) => n + p.length, 0);

      // Swap the surface to the NEW story — text plus the structural content, which the
      // figure/table/sources blocks now read from here so they load in WITH the type
      // (rather than popping when the caller commits) — and type it in from the top.
      setSt((s) => ({
        ...s,
        phase: 'typing',
        animateHead,
        headline,
        dek,
        paras,
        body,
        table,
        graphic,
        sources,
        kicker,
        byline,
        revealed: 0,
      }));
      await tween(
        0,
        total,
        typeMs(total),
        linear,
        (v) => setSt((s) => ({ ...s, revealed: Math.round(v) })),
        () => runId.current !== id,
      );
      if (runId.current !== id) return;
      // Hold the finished copy a beat, then hand back to the caller to commit.
      setSt((s) => ({ ...s, phase: 'settling', revealed: total }));
      await new Promise<void>((r) => setTimeout(r, 240));
    },
    [],
  );

  const play = useCallback(
    async ({
      slot,
      articleIndex,
      oldBody,
      newBody,
    }: {
      slot: number;
      articleIndex: number;
      oldBody: string;
      newBody: string;
    }) => {
      if (!oldBody && !newBody) return;
      const { id, erased } = begin({ slot, articleIndex, body: oldBody });
      await erased;
      await type(id, { body: newBody });
    },
    [begin, type],
  );

  const value = useMemo<LiveEditController>(
    () => ({ ...st, begin, type, play, end }),
    [st, begin, type, play, end],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

/**
 * Read the live-edit state. Returns a safe no-op controller when used outside the
 * provider (e.g. the build-phase view), so components never need a null check.
 */
export function useLiveEdit(): LiveEditController {
  const ctx = useContext(Ctx);
  if (ctx) return ctx;
  return {
    ...IDLE,
    begin: () => ({ id: 0, erased: Promise.resolve() }),
    type: async () => {},
    play: async () => {},
    end: () => {},
  };
}
