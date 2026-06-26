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
  headline: string;
  dek: string;
  paras: string[]; // body split into paragraphs (erase renders these per leaf slot)
  body: string; // raw body text (typing renders this into the first paragraph slot)
  revealed: number; // chars shown so far, counted from the top: headline → dek → body
}

interface LiveEditController extends LiveEditState {
  /** Start an edit: erase the old story (returns its run id + an erase-complete promise). */
  begin: (opts: {
    slot: number;
    articleIndex: number;
    headline?: string;
    dek?: string;
    body: string;
  }) => { id: number; erased: Promise<void> };
  /** Type the new story in. No-op unless `id` still owns the stage. */
  type: (id: number, opts: { headline?: string; dek?: string; body: string }) => Promise<void>;
  /** One-shot erase+type for callers that already have the new text (local body edits). */
  play: (opts: { slot: number; articleIndex: number; oldBody: string; newBody: string }) => Promise<void>;
  /** Hand the stage back. Ignored if a newer run already owns it (pass the run id). */
  end: (id?: number) => void;
}

const IDLE: LiveEditState = {
  phase: 'idle',
  slot: null,
  articleKey: null,
  animateHead: false,
  headline: '',
  dek: '',
  paras: [],
  body: '',
  revealed: 0,
};

const Ctx = createContext<LiveEditController | null>(null);

const prefersReduced = () =>
  typeof window !== 'undefined' &&
  typeof window.matchMedia === 'function' &&
  window.matchMedia('(prefers-reduced-motion: reduce)').matches;

const easeOut = (t: number) => 1 - (1 - t) * (1 - t);
const linear = (t: number) => t;

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
/** True while the caret sits in the head block (body fully erased / not yet typed). */
export function liveCaretInHead(s: LiveEditState): boolean {
  return s.animateHead && liveBodyChars(s) <= 0;
}

const eraseMs = (total: number) => Math.min(900, Math.max(280, total * 1.1));
const typeMs = (total: number) => Math.min(1600, Math.max(500, total * 5));

/** rAF tween from→to over `ms`; calls onStep each frame, resolves at the end. */
function tween(
  from: number,
  to: number,
  ms: number,
  ease: (t: number) => number,
  onStep: (v: number) => void,
  cancelled: () => boolean,
): Promise<void> {
  return new Promise((resolve) => {
    const start = performance.now();
    const step = (now: number) => {
      if (cancelled()) return resolve();
      const t = Math.min(1, (now - start) / ms);
      onStep(from + (to - from) * ease(t));
      if (t >= 1) return resolve();
      requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  });
}

export function LiveEditProvider({ children }: { children: ReactNode }) {
  const [st, setSt] = useState<LiveEditState>(IDLE);
  const runId = useRef(0);

  const end = useCallback((id?: number) => {
    if (id !== undefined && id !== runId.current) return; // a newer run owns the stage
    runId.current++; // cancel any in-flight tween
    setSt(IDLE);
  }, []);

  const begin = useCallback(
    ({
      slot,
      articleIndex,
      headline = '',
      dek = '',
      body,
    }: {
      slot: number;
      articleIndex: number;
      headline?: string;
      dek?: string;
      body: string;
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

      setSt({ phase: 'erasing', slot, articleKey, animateHead, headline, dek, paras, body, revealed: total });
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
    async (id: number, { headline = '', dek = '', body }: { headline?: string; dek?: string; body: string }) => {
      if (runId.current !== id || prefersReduced()) return;
      const animateHead = Boolean(headline || dek);
      const paras = paragraphs(body);
      const total = headline.length + dek.length + paras.reduce((n, p) => n + p.length, 0);

      // Swap the surface to the NEW story and type it in from the top (title first).
      setSt((s) => ({ ...s, phase: 'typing', animateHead, headline, dek, paras, body, revealed: 0 }));
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
