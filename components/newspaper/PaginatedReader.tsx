'use client';
import { useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import type { TPage } from '@/lib/schema';
import { LEAF_H, LEAF_W } from '@/lib/newspaper/leafLayout';
import { useLiveEdit } from '@/lib/edition/liveEdit';
import { LeafView, usePagination } from './usePagination';

type Meta = { masthead: string; tagline: string; edition: string; dateLine: string };

const SPINE_W = 8; // matches the .spine width between the two leaves of a spread
const FLIP_MS = 0.78; // seconds for one page turn

/** A blank fixed-size sheet, so a half-empty final spread still reads as paper. */
function BlankLeaf() {
  return <div className="paper" style={{ width: LEAF_W, height: LEAF_H }} />;
}

function Sheet({ leaf, meta }: { leaf: ReturnType<typeof usePagination>['leaves'][number] | undefined; meta: Meta }) {
  return leaf ? <LeafView leaf={leaf} meta={meta} /> : <BlankLeaf />;
}

// Curl shading for a turning face. `spine` is the hinged edge ('left'|'right'); the
// sheen runs from a soft specular highlight at the fold, across the page, deepening
// into shadow at the free edge — what reads as a sheet of paper bowing into the light.
function curlSheen(spine: 'left' | 'right') {
  const angle = spine === 'left' ? 90 : 270;
  return `linear-gradient(${angle}deg,
    rgba(255,255,255,0.30) 0%,
    rgba(255,255,255,0) 16%,
    rgba(20,17,13,0.04) 48%,
    rgba(20,17,13,0.26) 78%,
    rgba(20,17,13,0.55) 100%)`;
}
// A bright lip along the free (outer) edge — the rolled paper catching light.
function curlLip(spine: 'left' | 'right') {
  const angle = spine === 'left' ? 90 : 270;
  return `linear-gradient(${angle}deg, transparent 90%, rgba(255,255,255,0.5) 99%, rgba(255,255,255,0) 100%)`;
}

/**
 * The turning leaf — the real book mechanic, dressed to PEEL. A single double-sided
 * sheet hinged at the spine: FRONT is the page you're leaving, BACK is the page you
 * arrive at. backface-visibility shows only the side facing you (no mirrored type),
 * and the destination spread sits revealed underneath (no content pop). Layered
 * curl shading + a lit leading-edge lip make the rigid turn read as a bowing,
 * lifting sheet rather than a flat swinging door.
 */
function FlipLeaf({
  dir,
  front,
  back,
  meta,
  onDone,
}: {
  dir: 1 | -1;
  front: ReturnType<typeof usePagination>['leaves'][number] | undefined;
  back: ReturnType<typeof usePagination>['leaves'][number] | undefined;
  meta: Meta;
  onDone: () => void;
}) {
  const isNext = dir > 0;
  const frontSpine = isNext ? 'left' : 'right'; // the hinge edge of the FRONT face
  const backSpine = isNext ? 'right' : 'left'; // mirrored on the back face
  return (
    <motion.div
      style={{
        position: 'absolute',
        top: 0,
        left: isNext ? LEAF_W + SPINE_W : 0,
        width: LEAF_W,
        height: LEAF_H,
        transformStyle: 'preserve-3d',
        transformOrigin: isNext ? 'left center' : 'right center',
        zIndex: 20,
      }}
      initial={{ rotateY: 0 }}
      animate={{ rotateY: isNext ? -180 : 180 }}
      transition={{ duration: FLIP_MS, ease: [0.42, 0.02, 0.22, 1] }}
      onAnimationComplete={onDone}
    >
      {/* FRONT — the page being turned away (visible 0°→90°). */}
      <div style={{ position: 'absolute', inset: 0, backfaceVisibility: 'hidden', WebkitBackfaceVisibility: 'hidden', boxShadow: '0 18px 50px rgba(0,0,0,0.35)' }}>
        <Sheet leaf={front} meta={meta} />
        <motion.div
          aria-hidden
          className="pointer-events-none absolute inset-0"
          style={{ background: curlSheen(frontSpine) }}
          initial={{ opacity: 0.12 }}
          animate={{ opacity: [0.12, 0.6, 0.92] }}
          transition={{ duration: FLIP_MS, ease: 'easeIn' }}
        />
        <motion.div
          aria-hidden
          className="pointer-events-none absolute inset-0"
          style={{ background: curlLip(frontSpine) }}
          initial={{ opacity: 0 }}
          animate={{ opacity: [0, 0.9, 0.4] }}
          transition={{ duration: FLIP_MS, ease: 'easeInOut' }}
        />
      </div>
      {/* BACK — the page being turned to (visible 90°→180°). */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          transform: 'rotateY(180deg)',
          backfaceVisibility: 'hidden',
          WebkitBackfaceVisibility: 'hidden',
          boxShadow: '0 18px 50px rgba(0,0,0,0.35)',
        }}
      >
        <Sheet leaf={back} meta={meta} />
        <motion.div
          aria-hidden
          className="pointer-events-none absolute inset-0"
          style={{ background: curlSheen(backSpine) }}
          initial={{ opacity: 0.92 }}
          animate={{ opacity: [0.92, 0.6, 0.08] }}
          transition={{ duration: FLIP_MS, ease: 'easeOut' }}
        />
        <motion.div
          aria-hidden
          className="pointer-events-none absolute inset-0"
          style={{ background: curlLip(backSpine) }}
          initial={{ opacity: 0.4 }}
          animate={{ opacity: [0.4, 0.9, 0] }}
          transition={{ duration: FLIP_MS, ease: 'easeInOut' }}
        />
      </div>
    </motion.div>
  );
}

/**
 * The finished-paper reader. Content is paginated into identically-sized leaves
 * (see usePagination); here we present them two-up as an open spread that fits the
 * viewport, turn pages with a real double-sided flip, and let the Copy Desk dock to
 * the paper's edge via the published --news-* geometry vars.
 */
export function PaginatedReader({ pages, meta, bw }: { pages: TPage[]; meta: Meta; bw: boolean }) {
  const { leaves, measurer } = usePagination(pages, meta);
  const live = useLiveEdit();

  const [spread, setSpread] = useState(0);
  // Last section we auto-pinned the reader to (so we persist it into `spread` only once
  // per change, never fighting the reader's own navigation). See the anchor logic below.
  const [prevAnchor, setPrevAnchor] = useState<number | null>(null);
  // A turn in progress: which way and between which spreads. Null when settled.
  const [flip, setFlip] = useState<{ dir: 1 | -1; from: number; to: number } | null>(null);
  const [cw, setCw] = useState(1000);
  const [ch, setCh] = useState(800);
  const [lightbox, setLightbox] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);

  const spreadCount = Math.max(1, Math.ceil(leaves.length / 2));
  const editing = live.phase !== 'idle';

  // One chip per topic, jumping to the spread where that topic begins.
  const topics = useMemo(() => {
    const seen = new Map<number, { topicIndex: number; label: string; spread: number }>();
    leaves.forEach((lf, i) => {
      if (!seen.has(lf.topicIndex)) {
        seen.set(lf.topicIndex, {
          topicIndex: lf.topicIndex,
          label: lf.topic,
          spread: Math.floor(i / 2),
        });
      }
    });
    return [...seen.values()];
  }, [leaves]);

  // Pin the reader to the section being changed for the WHOLE lifecycle — erase, rewrite,
  // and the post-commit reveal — so it watches the rewrite in place and never snaps to a
  // different section while the new one loads. `live.slot` drives the erase/type phases;
  // `live.revealSlot` drives the reveal that plays after the reducer commits.
  const anchorSlot = editing ? live.slot : live.revealSlot;
  const anchorSpread =
    anchorSlot != null ? topics.find((x) => x.topicIndex === anchorSlot)?.spread ?? null : null;

  // Persist the pinned section into `spread` (adjusting state during render — the
  // sanctioned alternative to a setState effect) so that once the edit + reveal finish
  // the reader is already on the rewritten section and never falls back to a stale spread.
  if (anchorSpread != null && anchorSpread !== prevAnchor) {
    setPrevAnchor(anchorSpread);
    setSpread(anchorSpread);
  }
  const cur = Math.min(anchorSpread ?? spread, spreadCount - 1);

  // Turn one spread forward/back. No-op at the ends, mid-turn, or while the Copy
  // Desk is live-editing (so the animation isn't yanked out from under the reader).
  const go = (forward: boolean) => {
    if (flip || editing) return;
    const target = forward ? Math.min(spreadCount - 1, cur + 1) : Math.max(0, cur - 1);
    if (target === cur) return;
    setFlip({ dir: forward ? 1 : -1, from: cur, to: target });
  };
  const finishFlip = () => {
    setFlip((f) => {
      if (f) setSpread(f.to);
      return null;
    });
  };

  // Fit the spread to BOTH width and height so the whole open paper — and its
  // turn-the-page corners — is always visible without scrolling.
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const update = () => {
      setCw((prev) => (Math.abs(el.clientWidth - prev) > 4 ? el.clientWidth : prev));
      const avail = window.innerHeight - el.getBoundingClientRect().top - 64;
      setCh((prev) => (Math.abs(avail - prev) > 4 ? Math.max(360, avail) : prev));
    };
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    window.addEventListener('resize', update);
    return () => {
      ro.disconnect();
      window.removeEventListener('resize', update);
    };
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setLightbox(null);
      else if (e.key === 'ArrowRight') go(true);
      else if (e.key === 'ArrowLeft') go(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // go() closes over cur/flip/editing/spreadCount — re-bind when those change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cur, spreadCount, flip, editing]);

  const portrait = cw < 720;
  const spreadW = (portrait ? LEAF_W : LEAF_W * 2 + SPINE_W) + 44;
  const spreadH = LEAF_H + 34;
  const fitW = (cw - 8) / spreadW;
  const fitH = (ch - 8) / spreadH;
  const zoom = Math.max(0.3, Math.min(fitW, fitH, 1.6));

  // Publish the spread's live geometry as CSS vars so the Copy Desk can dock to the
  // newspaper's right edge (and match its height) instead of clinging to the screen
  // edge. No feedback loop: the desk is out of flow, so moving it can't change this.
  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const root = document.documentElement;
    const measure = () => {
      const r = el.getBoundingClientRect();
      root.style.setProperty('--news-right', `${Math.round(r.right)}px`);
      root.style.setProperty('--news-top', `${Math.round(r.top)}px`);
      root.style.setProperty('--news-h', `${Math.round(r.height)}px`);
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    window.addEventListener('resize', measure);
    window.addEventListener('scroll', measure, true);
    const id = setInterval(measure, 90);
    const stop = setTimeout(() => clearInterval(id), 900);
    return () => {
      ro.disconnect();
      window.removeEventListener('resize', measure);
      window.removeEventListener('scroll', measure, true);
      clearInterval(id);
      clearTimeout(stop);
    };
  }, [zoom, cur, leaves.length]);

  const chipBase = 'font-mono-news inline-flex items-center gap-1.5 rounded-sm border px-2.5 py-0.5 text-[11px] uppercase tracking-wide transition-colors shadow-sm';
  const pill = 'border-[var(--ink)]/40 bg-[var(--paper)]/85 text-[var(--ink)] hover:bg-[var(--paper)]';

  // Underlayer composition. During a turn the base already shows the DESTINATION on
  // the half being revealed, so the flip uncovers it seamlessly.
  let baseLeft = leaves[cur * 2];
  let baseRight = leaves[cur * 2 + 1];
  if (flip) {
    if (flip.dir > 0) {
      baseLeft = leaves[flip.from * 2];
      baseRight = leaves[flip.to * 2 + 1];
    } else {
      baseLeft = leaves[flip.to * 2];
      baseRight = leaves[flip.from * 2 + 1];
    }
  }
  // The double-sided turning leaf: front = page you leave, back = page you arrive at.
  const flipFront = flip ? (flip.dir > 0 ? leaves[flip.from * 2 + 1] : leaves[flip.from * 2]) : undefined;
  const flipBack = flip ? (flip.dir > 0 ? leaves[flip.to * 2] : leaves[flip.to * 2 + 1]) : undefined;

  return (
    <div className="flex w-full max-w-[1560px] flex-col items-center gap-3">
      {measurer}

      {/* Section jumps */}
      <div className="flex w-full flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-1.5">
          {topics.map((t) => (
            <button
              key={t.topicIndex}
              onClick={() => !editing && setSpread(t.spread)}
              className={`${chipBase} ${t.spread === cur ? 'border-[var(--ink)] bg-[var(--ink)] text-[var(--paper)]' : pill}`}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {/* The open spread — fit to the viewport, no scroll */}
      <div
        ref={scrollRef}
        className="w-full overflow-hidden [&_img]:cursor-zoom-in"
        onClick={(e) => {
          const t = e.target as HTMLElement;
          if (t.tagName === 'IMG') setLightbox((t as HTMLImageElement).src);
        }}
      >
        <div className="flex w-full justify-center py-1">
          {/* Relative wrapper shrink-wraps the zoomed frame, so the corner controls
              (kept OUTSIDE the zoom for a constant size) pin to the real paper corners.
              Its measured rect also anchors the Copy Desk to the newspaper's edge. */}
          <div ref={wrapRef} className="relative inline-block">
            <div
              className={`spread-frame ${bw ? 'bw' : ''}`}
              style={{ zoom, position: 'relative' }}
            >
              {/* The spread content; perspective lives here so the turning leaf — its
                  direct child — gets real 3D depth. */}
              <div
                className={`relative flex ${portrait ? 'flex-col gap-3' : 'flex-row'}`}
                style={{ perspective: '1500px', perspectiveOrigin: 'center 50%' }}
              >
                <Sheet leaf={baseLeft} meta={meta} />
                {!portrait && <div className="spine" />}
                {!portrait ? <Sheet leaf={baseRight} meta={meta} /> : null}

                {/* Cast shadow the lifting leaf throws onto the page it sweeps OVER
                    (the left half for a forward turn, the right for back). Anchored
                    at the spine, fanning toward the free edge, deepest mid-late turn. */}
                {flip && !portrait && (
                  <motion.div
                    aria-hidden
                    className="pointer-events-none absolute top-0"
                    style={{
                      left: flip.dir > 0 ? 0 : LEAF_W + SPINE_W,
                      width: LEAF_W,
                      height: LEAF_H,
                      zIndex: 10,
                      background:
                        flip.dir > 0
                          ? 'linear-gradient(270deg, rgba(20,17,13,0.5), rgba(20,17,13,0) 62%)'
                          : 'linear-gradient(90deg, rgba(20,17,13,0.5), rgba(20,17,13,0) 62%)',
                    }}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: [0, 0.1, 0.55, 0.2] }}
                    transition={{ duration: FLIP_MS, ease: 'easeInOut' }}
                  />
                )}

                {/* The turning leaf. Portrait mode skips the 3D turn (single column). */}
                {flip && !portrait && (
                  <FlipLeaf
                    key={`${flip.from}-${flip.to}-${flip.dir}`}
                    dir={flip.dir}
                    front={flipFront}
                    back={flipBack}
                    meta={meta}
                    onDone={finishFlip}
                  />
                )}
              </div>
            </div>

            {/* Turn-the-page corners (hidden mid-turn / while editing). */}
            {!flip && !editing && cur > 0 && (
              <button
                type="button"
                onClick={() => go(false)}
                aria-label="Previous spread"
                title="Previous spread"
                className="page-corner page-corner--prev"
              >
                <span className="page-corner__fold" aria-hidden />
                <span className="page-corner__arrow" aria-hidden>‹</span>
                <span className="page-corner__hint" aria-hidden>Back</span>
              </button>
            )}
            {!flip && !editing && cur < spreadCount - 1 && (
              <button
                type="button"
                onClick={() => go(true)}
                aria-label="Next spread"
                title="Next spread"
                className="page-corner page-corner--next"
              >
                <span className="page-corner__fold" aria-hidden />
                <span className="page-corner__arrow" aria-hidden>›</span>
                <span className="page-corner__hint" aria-hidden>Next</span>
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Faint wayfinding counter (turn via the corners). */}
      {spreadCount > 1 && (
        <div className="font-mono-news text-[10.5px] uppercase tracking-[0.3em] text-[var(--paper)]/60">
          Spread {(flip ? flip.from : cur) + 1} / {spreadCount}
        </div>
      )}

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
