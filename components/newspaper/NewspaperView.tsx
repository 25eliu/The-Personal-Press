'use client';
import { useEffect, useMemo, useRef, useState } from 'react';
import type { TPage } from '@/lib/schema';
import type { SectionPlanItem } from '@/lib/stream/events';
import { PaginatedReader } from './PaginatedReader';
import { RevealingPage } from './RevealingPage';
import { usePageRevealQueue } from '@/lib/edition/reveal';
import { Typewriter } from '@/components/build/Typewriter';
import { LEAF_H } from '@/lib/newspaper/leafLayout';

// Kept equal to leafLayout's LEAF_W so the build skeleton and the finished leaves are
// the same physical page width; the fit below matches the reader so size is stable.
const PAGE_W = 600; // fixed page width; the whole spread is fit-scaled to the viewport

type Meta = { masthead: string; tagline: string; edition: string; dateLine: string };

// Newsroom status lines the press types out while a page is being set.
const SETTING_LINES = [
  'Reporters filing copy…',
  'Checking the wire for fresh numbers…',
  'Setting the headline in the stick…',
  'Locking the chase, page by page…',
  'Reading proofs against the source…',
  'Inking the rollers…',
];

// Lines for the very first wait, before the editor has returned a section plan.
const PLANNING_LINES = [
  'Reading your brief…',
  'Assigning reporters to the desks…',
  'Drawing up today’s section plan…',
  'Booking space on the front page…',
  'Warming up the composing room…',
];

function SkeletonPage({ topic }: { topic: string }) {
  return (
    <div className="paper relative flex h-full w-full flex-col gap-2 overflow-hidden px-6 py-6">
      <div className="type-setting flex flex-col gap-2">
        <div className="h-7 w-3/4 bg-black/70" />
        <div className="h-3 w-1/3 bg-black/30" />
        <div className="mt-2 h-32 w-full border border-black/40 bg-black/[0.04]" />
        {Array.from({ length: 12 }).map((_, i) => (
          <div key={i} className="h-2.5 bg-black/10" style={{ width: `${100 - (i % 4) * 8}%` }} />
        ))}
      </div>
      <p className="mt-auto pt-3 text-center">
        <Typewriter
          messages={SETTING_LINES}
          className="text-[11px] uppercase tracking-[0.16em] text-[var(--ink)]/65"
        />
        <span className="font-mono-news mt-1 block text-[10px] uppercase tracking-[0.2em] text-[var(--ink)]/35">
          {topic}
        </span>
      </p>
    </div>
  );
}

/** Shown before the editor has planned the sections — a calm composing-room terminal. */
function PlanningSheet() {
  return (
    <div className="paper relative flex h-full w-full flex-col items-center justify-center gap-6 overflow-hidden px-8 py-16 text-center">
      <span className="font-mono-news text-[10px] uppercase tracking-[0.34em] text-[var(--ink)]/40">
        The Personal Press · Composing Room
      </span>
      <Typewriter
        messages={PLANNING_LINES}
        className="block min-h-[1.6em] text-[16px] tracking-[0.04em] text-[var(--ink)]"
      />
      <div className="h-px w-44 bg-[var(--ink)]/15" />
    </div>
  );
}

/**
 * One bounded page in the spread (600×LEAF_H, clipped). While building it shows the
 * typewriter reveal IN PLACE: a page that's revealed/typing renders `RevealingPage` (so the
 * text types within the page boundary, top-down); a page whose turn hasn't come (not yet
 * generated, or queued behind an earlier page) shows the "setting type" skeleton.
 */
function PageSheet({ page, slot, topic, meta, building, mode, cursor }: {
  page: TPage | null; slot: number; topic: string; meta: Meta; building: boolean;
  mode: 'done' | 'active' | 'pending'; cursor: number;
}) {
  return (
    <div className="relative overflow-hidden" style={{ width: PAGE_W, height: LEAF_H }}>
      {page && (mode === 'done' || mode === 'active') ? (
        <RevealingPage page={page} slot={slot} meta={meta} cursor={mode === 'done' ? Infinity : cursor} />
      ) : building ? (
        <SkeletonPage topic={topic} />
      ) : (
        <div className="paper w-full" style={{ minHeight: 560 }} />
      )}
    </div>
  );
}

export function NewspaperView({ plan, pages, meta, building, bw, generationDone, onFinished, flipTo }: {
  plan: SectionPlanItem[];
  pages: (TPage | null)[];
  meta: Meta;
  building: boolean;
  bw: boolean;
  generationDone: boolean;
  onFinished: () => void;
  /** Click-to-flip target from the Copy Desk; forwarded to the reader. */
  flipTo?: { slot: number; nonce: number } | null;
}) {
  const slots = useMemo(
    () => (plan.length > 0 ? plan.map((p) => p.slot) : pages.map((_, i) => i)),
    [plan, pages],
  );
  const topicFor = (i: number) => pages[i]?.topic ?? plan[i]?.topic ?? `Page ${i + 1}`;

  const [spread, setSpread] = useState(0);
  const [cw, setCw] = useState(1000);
  const [ch, setCh] = useState(800);
  const scrollRef = useRef<HTMLDivElement>(null);

  const spreadCount = Math.max(1, Math.ceil(slots.length / 2));
  const cur = Math.min(spread, spreadCount - 1);
  const left = cur * 2;
  const right = left + 1;

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    // Ignore sub-threshold changes so a toggling scrollbar can't cause a
    // fit→zoom→scrollbar feedback loop (which would thrash renders / crash).
    const update = () => {
      setCw((prev) => (Math.abs(el.clientWidth - prev) > 4 ? el.clientWidth : prev));
      setCh((prev) => (Math.abs(window.innerHeight - prev) > 4 ? window.innerHeight : prev));
    };
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    window.addEventListener('resize', update);
    return () => { ro.disconnect(); window.removeEventListener('resize', update); };
  }, []);

  // Front-to-back typewriter reveal, IN PLACE within the spread (see usePageRevealQueue).
  const { doneSlots, activeSlot, cursor } = usePageRevealQueue(slots, pages, generationDone, onFinished);
  const modeFor = (slot: number): 'done' | 'active' | 'pending' =>
    doneSlots.has(slot) ? 'done' : slot === activeSlot ? 'active' : 'pending';

  // Auto-advance the visible spread to follow the page currently typing (manual nav still works).
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (activeSlot != null) setSpread(Math.floor(activeSlot / 2));
  }, [activeSlot]);

  const portrait = cw < 720;
  // Match the reading paginator's fit EXACTLY (same spread dims, same width+height
  // budget, same 1.6 cap) so the spread does NOT change size at the build→read handoff.
  // Height matters: the reader is height-constrained on standard monitors, so a
  // width-only build fit rendered visibly larger ("big, then shrinks"). The build
  // scroller is capped at 82vh (see maxHeight below), so that's the height to fit into.
  const spreadW = (portrait ? PAGE_W : PAGE_W * 2 + 8) + 44;
  const spreadH = LEAF_H + 34;
  const availH = ch * 0.84; // ≈ the reader's own height budget (innerHeight − chrome)
  const zoom = Math.max(0.3, Math.min((cw - 8) / spreadW, (availH - 8) / spreadH, 1.6));

  const jump = (slot: number) => setSpread(Math.floor(slot / 2));

  const chipBase = 'font-mono-news inline-flex items-center gap-1.5 rounded-sm border px-2.5 py-0.5 text-[11px] uppercase tracking-wide transition-colors shadow-sm';
  const pill = 'border-[var(--ink)]/40 bg-[var(--paper)]/85 text-[var(--ink)] hover:bg-[var(--paper)]';

  // Finished paper: hand off to the paginator, which lays the whole edition into
  // identically-sized leaves and presents them as a two-up spread. The build phase
  // below stays as-is (streaming skeletons), since pages arrive one at a time.
  if (!building) {
    const finished = pages.filter((p): p is TPage => Boolean(p));
    if (finished.length > 0) return <PaginatedReader pages={finished} meta={meta} bw={bw} flipTo={flipTo} />;
  }

  // Before the editor returns a plan there are no slots yet — show a clear
  // "planning" sheet instead of a fake skeleton page with a placeholder topic.
  if (building && slots.length === 0) {
    return (
      <div className="flex w-full max-w-[1560px] flex-col items-center gap-3">
        <div className="flex w-full justify-center">
          <div className={`spread-frame ${bw ? 'bw' : ''}`} style={{ zoom }}>
            <div className="flex" style={{ width: PAGE_W * 2 + 8, height: LEAF_H }}>
              <PlanningSheet />
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex w-full max-w-[1560px] flex-col items-center gap-3">
      {/* Control bar */}
      <div className="flex w-full flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-1.5">
          {slots.map((i) => {
            const ready = Boolean(pages[i]);
            return (
              <button
                key={i}
                onClick={() => jump(i)}
                className={`${chipBase} ${
                  Math.floor(i / 2) === cur
                    ? 'border-[var(--ink)] bg-[var(--ink)] text-[var(--paper)]'
                    : pill
                }`}
              >
                {building && (
                  ready ? (
                    <span className="text-[var(--ink)]/70">✓</span>
                  ) : (
                    <span className="live-dot text-[var(--ink)]/45">●</span>
                  )
                )}
                {topicFor(i)}
              </button>
            );
          })}
        </div>
      </div>

      {/* Scrollable, zoomable spread */}
      <div
        ref={scrollRef}
        className="news-scroll w-full overflow-auto"
        style={{ maxHeight: '82vh' }}
      >
        <div className="flex w-full justify-center">
          <div className={`spread-frame ${bw ? 'bw' : ''}`} style={{ zoom }}>
            <div className={`flex ${portrait ? 'flex-col gap-3' : 'flex-row'}`}>
              <PageSheet page={pages[left] ?? null} slot={left} topic={topicFor(left)} meta={meta} building={building} mode={modeFor(left)} cursor={cursor} />
              {!portrait && <div className="spine" />}
              {right < slots.length ? (
                <PageSheet page={pages[right] ?? null} slot={right} topic={topicFor(right)} meta={meta} building={building} mode={modeFor(right)} cursor={cursor} />
              ) : (
                !portrait && <div className="paper" style={{ width: PAGE_W, height: LEAF_H }} />
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Spread navigation */}
      <div className="font-mono-news flex items-center gap-2 rounded-full border border-[var(--ink)]/40 bg-[var(--paper)]/85 px-3 py-1 text-xs uppercase tracking-widest text-[var(--ink)] shadow-sm">
        <button onClick={() => setSpread((s) => Math.max(0, s - 1))} disabled={cur === 0} className="hover:opacity-70 disabled:opacity-30">◀ Prev</button>
        <span className="px-1 opacity-70">Spread {cur + 1} / {spreadCount}</span>
        <button onClick={() => setSpread((s) => Math.min(spreadCount - 1, s + 1))} disabled={cur >= spreadCount - 1} className="hover:opacity-70 disabled:opacity-30">Next ▶</button>
      </div>

    </div>
  );
}
