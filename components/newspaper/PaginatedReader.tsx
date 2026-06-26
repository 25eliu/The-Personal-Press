'use client';
import { useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import type { TPage } from '@/lib/schema';
import { LEAF_H, LEAF_W } from '@/lib/newspaper/leafLayout';
import { LeafView, usePagination } from './usePagination';

type Meta = { masthead: string; tagline: string; edition: string; dateLine: string };

/** A blank fixed-size sheet, so a half-empty final spread still reads as paper. */
function BlankLeaf() {
  return <div className="paper" style={{ width: LEAF_W, height: LEAF_H }} />;
}

/**
 * The finished-paper reader. Content is paginated into identically-sized leaves
 * (see usePagination); here we present them two-up as an open spread, with the same
 * zoom / scroll / section-jump / chart-lightbox chrome the build view uses.
 */
export function PaginatedReader({ pages, meta, bw }: { pages: TPage[]; meta: Meta; bw: boolean }) {
  const { leaves, measurer } = usePagination(pages, meta);

  const [spread, setSpread] = useState(0);
  const [mult, setMult] = useState(1);
  const [cw, setCw] = useState(1000);
  const [lightbox, setLightbox] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  const spreadCount = Math.max(1, Math.ceil(leaves.length / 2));
  const cur = Math.min(spread, spreadCount - 1);
  const left = cur * 2;
  const right = left + 1;

  // One chip per topic, jumping to the spread where that topic begins.
  const topics = useMemo(() => {
    const seen = new Map<number, { topicIndex: number; label: string; spread: number }>();
    leaves.forEach((lf, i) => {
      if (!seen.has(lf.topicIndex)) {
        seen.set(lf.topicIndex, {
          topicIndex: lf.topicIndex,
          label: lf.topicIndex === 0 ? 'Front' : lf.topic,
          spread: Math.floor(i / 2),
        });
      }
    });
    return [...seen.values()];
  }, [leaves]);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const update = () => setCw((prev) => (Math.abs(el.clientWidth - prev) > 4 ? el.clientWidth : prev));
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setLightbox(null);
      if (e.key === 'ArrowRight') setSpread((s) => Math.min(spreadCount - 1, s + 1));
      if (e.key === 'ArrowLeft') setSpread((s) => Math.max(0, s - 1));
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [spreadCount]);

  const portrait = cw < 720;
  const spreadW = (portrait ? LEAF_W : LEAF_W * 2) + 40;
  const fit = Math.min(1.5, (cw - 8) / spreadW);
  const zoom = Math.max(0.3, fit * mult);

  const chipBase = 'font-mono-news inline-flex items-center gap-1.5 rounded-sm border px-2.5 py-0.5 text-[11px] uppercase tracking-wide transition-colors shadow-sm';
  const pill = 'border-[var(--ink)]/40 bg-[var(--paper)]/85 text-[var(--ink)] hover:bg-[var(--paper)]';

  return (
    <div className="flex w-full max-w-[1560px] flex-col items-center gap-3">
      {measurer}

      {/* Section jumps + zoom */}
      <div className="flex w-full flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-1.5">
          {topics.map((t) => (
            <button
              key={t.topicIndex}
              onClick={() => setSpread(t.spread)}
              className={`${chipBase} ${t.spread === cur ? 'border-[var(--ink)] bg-[var(--ink)] text-[var(--paper)]' : pill}`}
            >
              {t.label}
            </button>
          ))}
        </div>
        <div className="font-mono-news flex items-center gap-1 text-[11px]">
          <button onClick={() => setMult((m) => Math.max(0.6, +(m - 0.2).toFixed(2)))} className={`h-6 w-6 rounded-sm border shadow-sm ${pill}`} aria-label="Zoom out">−</button>
          <button onClick={() => setMult(1)} className={`rounded-sm border px-2 py-0.5 shadow-sm ${pill}`} aria-label="Fit">{Math.round(zoom * 100)}%</button>
          <button onClick={() => setMult((m) => Math.min(3, +(m + 0.2).toFixed(2)))} className={`h-6 w-6 rounded-sm border shadow-sm ${pill}`} aria-label="Zoom in">+</button>
        </div>
      </div>

      {/* The open spread */}
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
            <AnimatePresence mode="wait">
              <motion.div
                key={cur}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.28 }}
                className={`flex ${portrait ? 'flex-col gap-3' : 'flex-row'}`}
              >
                {leaves[left] ? <LeafView leaf={leaves[left]} meta={meta} /> : <BlankLeaf />}
                {!portrait && <div className="spine" />}
                {leaves[right] ? <LeafView leaf={leaves[right]} meta={meta} /> : !portrait && <BlankLeaf />}
              </motion.div>
            </AnimatePresence>
          </div>
        </div>
      </div>

      {/* Spread navigation */}
      <div className="font-mono-news flex items-center gap-2 rounded-full border border-[var(--ink)]/40 bg-[var(--paper)]/85 px-3 py-1 text-xs uppercase tracking-widest text-[var(--ink)] shadow-sm">
        <button onClick={() => setSpread((s) => Math.max(0, s - 1))} disabled={cur === 0} className="hover:opacity-70 disabled:opacity-30">◀ Prev</button>
        <span className="px-1 opacity-70">Spread {cur + 1} / {spreadCount}</span>
        <button onClick={() => setSpread((s) => Math.min(spreadCount - 1, s + 1))} disabled={cur >= spreadCount - 1} className="hover:opacity-70 disabled:opacity-30">Next ▶</button>
      </div>

      {/* Chart lightbox */}
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
