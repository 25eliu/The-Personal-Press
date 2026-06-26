'use client';
import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import type { TPage } from '@/lib/schema';
import type { SectionPlanItem } from '@/lib/stream/events';
import { NewspaperPage } from './NewspaperPage';
import { PaginatedReader } from './PaginatedReader';

const PAGE_W = 600; // fixed page width; the whole spread is fit-scaled to the viewport

type Meta = { masthead: string; tagline: string; edition: string; dateLine: string };

function SkeletonPage({ topic }: { topic: string }) {
  return (
    <div className="paper press-sweep relative flex w-full flex-col gap-2 overflow-hidden px-6 py-6" style={{ minHeight: 560 }}>
      <div className="shimmer-bars flex flex-col gap-2">
        <div className="h-7 w-3/4 bg-black/80" />
        <div className="h-3 w-1/3 bg-black/40" />
        <div className="mt-2 h-32 w-full border border-black/50 bg-black/5" />
        {Array.from({ length: 12 }).map((_, i) => (
          <div key={i} className="h-2.5 bg-black/15" style={{ width: `${100 - (i % 4) * 8}%` }} />
        ))}
      </div>
      <p className="font-mono-news mt-auto flex items-center justify-center gap-2 pt-2 text-center text-[10px] uppercase tracking-widest text-black/55">
        <span className="live-dot text-[var(--accent)]">●</span> Reporting &amp; setting type — {topic}
      </p>
    </div>
  );
}

/** Shown before the editor has planned the sections — makes the "planning" wait legible. */
function PlanningSheet() {
  return (
    <div className="paper press-sweep relative flex w-full flex-col items-center justify-center gap-4 overflow-hidden px-8 py-16 text-center" style={{ minHeight: 560 }}>
      <motion.div
        animate={{ rotate: [0, -8, 8, 0] }}
        transition={{ duration: 2.4, repeat: Infinity, ease: 'easeInOut' }}
        className="text-5xl"
      >
        🐙
      </motion.div>
      <h2 className="font-masthead text-3xl text-[var(--ink)]">Planning today’s edition</h2>
      <p className="font-mono-news max-w-sm text-[12px] uppercase tracking-[0.18em] text-[var(--ink)]/55">
        The editor is reading your brief and assigning reporters to the day’s sections…
      </p>
      <div className="mt-2 flex gap-1.5">
        {[0, 1, 2].map((i) => (
          <motion.span
            key={i}
            className="h-2 w-2 rounded-full bg-[var(--accent)]"
            animate={{ opacity: [0.25, 1, 0.25] }}
            transition={{ duration: 1.1, repeat: Infinity, delay: i * 0.18 }}
          />
        ))}
      </div>
    </div>
  );
}

function PageSheet({ page, slot, topic, meta, building }: {
  page: TPage | null; slot: number; topic: string; meta: Meta; building: boolean;
}) {
  return (
    <div className="relative" style={{ width: PAGE_W }}>
      <AnimatePresence mode="wait">
        {page ? (
          <motion.div key="p" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.35 }}>
            <NewspaperPage page={page} slot={slot} {...meta} />
          </motion.div>
        ) : building ? (
          <motion.div key="s" exit={{ opacity: 0 }}>
            <SkeletonPage topic={topic} />
          </motion.div>
        ) : (
          <div className="paper w-full" style={{ minHeight: 560 }} />
        )}
      </AnimatePresence>
    </div>
  );
}

export function NewspaperView({ plan, pages, meta, building, bw }: {
  plan: SectionPlanItem[];
  pages: (TPage | null)[];
  meta: Meta;
  building: boolean;
  bw: boolean;
}) {
  const slots = plan.length > 0 ? plan.map((p) => p.slot) : pages.map((_, i) => i);
  const topicFor = (i: number) => pages[i]?.topic ?? plan[i]?.topic ?? `Page ${i + 1}`;

  const [spread, setSpread] = useState(0);
  const [mult, setMult] = useState(1);
  const [cw, setCw] = useState(1000);
  const [lightbox, setLightbox] = useState<string | null>(null);
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
    const update = () => setCw((prev) => (Math.abs(el.clientWidth - prev) > 4 ? el.clientWidth : prev));
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Esc closes the chart lightbox.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setLightbox(null); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const portrait = cw < 720;
  const spreadW = (portrait ? PAGE_W : PAGE_W * 2) + 40;
  // Let the spread scale up toward broadsheet size when there's room (cap 1.5);
  // the container max-width below is what actually bounds it on wide screens.
  const fit = Math.min(1.5, (cw - 8) / spreadW);
  const zoom = Math.max(0.3, fit * mult);

  const jump = (slot: number) => setSpread(Math.floor(slot / 2));

  const chipBase = 'font-mono-news inline-flex items-center gap-1.5 rounded-sm border px-2.5 py-0.5 text-[11px] uppercase tracking-wide transition-colors shadow-sm';
  const pill = 'border-[var(--ink)]/40 bg-[var(--paper)]/85 text-[var(--ink)] hover:bg-[var(--paper)]';

  // Finished paper: hand off to the paginator, which lays the whole edition into
  // identically-sized leaves and presents them as a two-up spread. The build phase
  // below stays as-is (streaming skeletons), since pages arrive one at a time.
  if (!building) {
    const finished = pages.filter((p): p is TPage => Boolean(p));
    if (finished.length > 0) return <PaginatedReader pages={finished} meta={meta} bw={bw} />;
  }

  // Before the editor returns a plan there are no slots yet — show a clear
  // "planning" sheet instead of a fake skeleton page with a placeholder topic.
  if (building && slots.length === 0) {
    return (
      <div className="flex w-full max-w-[1560px] flex-col items-center gap-3">
        <div className="flex w-full justify-center">
          <div className={`spread-frame ${bw ? 'bw' : ''}`} style={{ zoom }}>
            <div className="flex" style={{ width: PAGE_W }}>
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
                    <span className="text-[var(--accent)]">✓</span>
                  ) : (
                    <span className="live-dot text-[var(--accent)]">●</span>
                  )
                )}
                {i === 0 ? 'Front' : topicFor(i)}
              </button>
            );
          })}
        </div>
        <div className="font-mono-news flex items-center gap-1 text-[11px]">
          <button onClick={() => setMult((m) => Math.max(0.6, +(m - 0.2).toFixed(2)))} className={`h-6 w-6 rounded-sm border shadow-sm ${pill}`} aria-label="Zoom out">−</button>
          <button onClick={() => setMult(1)} className={`rounded-sm border px-2 py-0.5 shadow-sm ${pill}`} aria-label="Fit">{Math.round(zoom * 100)}%</button>
          <button onClick={() => setMult((m) => Math.min(3, +(m + 0.2).toFixed(2)))} className={`h-6 w-6 rounded-sm border shadow-sm ${pill}`} aria-label="Zoom in">+</button>
        </div>
      </div>

      {/* Scrollable, zoomable spread */}
      <div
        ref={scrollRef}
        className="news-scroll w-full overflow-auto [&_img]:cursor-zoom-in"
        style={{ maxHeight: '82vh' }}
        onClick={(e) => {
          const t = e.target as HTMLElement;
          if (t.tagName === 'IMG') setLightbox((t as HTMLImageElement).src);
        }}
      >
        <div className="flex w-full justify-center">
          <div className={`spread-frame ${bw ? 'bw' : ''}`} style={{ zoom }}>
            <div className={`flex ${portrait ? 'flex-col gap-3' : 'flex-row'}`}>
              <PageSheet page={pages[left] ?? null} slot={left} topic={topicFor(left)} meta={meta} building={building} />
              {!portrait && <div className="spine" />}
              {right < slots.length ? (
                <PageSheet page={pages[right] ?? null} slot={right} topic={topicFor(right)} meta={meta} building={building} />
              ) : (
                !portrait && <div className="paper" style={{ width: PAGE_W }} />
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

      {/* Chart lightbox — click a chart to zoom in */}
      <AnimatePresence>
        {lightbox && (
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 p-6"
            onClick={() => setLightbox(null)}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={lightbox} alt="chart" className={`max-h-[90vh] max-w-[92vw] border-4 border-[var(--paper)] shadow-2xl ${bw ? 'bw' : ''}`} />
            <button className="font-mono-news absolute right-5 top-5 rounded border border-[var(--paper)]/60 px-3 py-1 text-xs uppercase tracking-widest text-[var(--paper)]">Close ✕</button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
