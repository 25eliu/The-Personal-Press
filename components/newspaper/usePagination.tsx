'use client';
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { TPage } from '@/lib/schema';
import { type Block, flattenTopic } from '@/lib/newspaper/blocks';
import { type Leaf, packAll } from '@/lib/newspaper/paginate';
import { BLOCK_GAP, COL_W, HEADER_GAP, LEAF_W, PAD_X } from '@/lib/newspaper/leafLayout';
import { BlockView } from './BlockView';
import { Leaf as LeafView, TopicBar } from './Leaf';
import { Masthead } from './Masthead';

type Meta = { masthead: string; tagline: string; edition: string; dateLine: string };

/**
 * Measures every block off-screen at the real column width, then packs the paper
 * into fixed-size leaves. Measuring is the only way to guarantee identical pages:
 * we ask the browser how tall each headline/paragraph/figure actually is, then lay
 * them into the box ourselves. Re-runs when the content changes (live edits) and
 * once web fonts finish loading (their metrics shift line counts).
 */
export function usePagination(pages: TPage[], meta: Meta): { leaves: Leaf[]; measurer: React.ReactNode } {
  const ref = useRef<HTMLDivElement>(null);
  const [leaves, setLeaves] = useState<Leaf[]>([]);

  const blocks = useMemo<Block[]>(() => pages.flatMap((p, i) => flattenTopic(p, i)), [pages]);

  // A cheap content fingerprint: re-measure only when the words/shapes/data change, not
  // on every render (and never on zoom, which doesn't affect px heights). The graphic and
  // table are serialized in FULL — fingerprinting a graphic by `kind` alone froze the paper
  // on any same-kind reshape (new series, sub-type, windowed rows) or data swap, so the
  // Copy Desk's edit committed to state but never repainted the leaf.
  const signature = useMemo(
    () =>
      JSON.stringify(
        pages.map((p) => [p.topic, p.articles.map((a) => [a.size, a.headline, a.dek ?? '', a.body.length, a.table ?? null, a.graphic ?? null])]),
      ) + `|${meta.masthead}|${meta.tagline}|${meta.edition}|${meta.dateLine}`,
    [pages, meta],
  );

  const measure = useCallback(() => {
    const root = ref.current;
    if (!root) return;
    const heightOf = (mid: string) => {
      const el = root.querySelector<HTMLElement>(`[data-mid="${CSS.escape(mid)}"]`);
      return el ? el.getBoundingClientRect().height : 0;
    };
    const blockHeights = new Map<string, number>();
    blocks.forEach((b) => blockHeights.set(b.id, heightOf(b.id) + BLOCK_GAP));
    const mastheadH = heightOf('__masthead') + HEADER_GAP;
    const topicbarH = heightOf('__topicbar') + HEADER_GAP;
    setLeaves(packAll(pages, (b) => blockHeights.get(b.id) ?? 0, mastheadH, topicbarH));
  }, [blocks, pages]);

  // Measure before paint so the reader never sees an unpaginated flash.
  useLayoutEffect(() => {
    measure();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signature]);

  // Fonts swap in after first paint and change text height — re-pack when ready.
  useEffect(() => {
    let live = true;
    document.fonts?.ready.then(() => {
      if (live) measure();
    });
    return () => {
      live = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signature]);

  const measurer = (
    <div
      ref={ref}
      aria-hidden
      style={{ position: 'absolute', left: -99999, top: 0, visibility: 'hidden', pointerEvents: 'none' }}
    >
      {/* Header heights are measured at full content width. */}
      <div style={{ width: LEAF_W - PAD_X * 2 }}>
        <div data-mid="__masthead"><Masthead {...meta} /></div>
        <div data-mid="__topicbar"><TopicBar topic="Sample" part={1} total={2} masthead={meta.masthead} /></div>
      </div>
      {/* Block heights are measured at the real single-column width. */}
      <div style={{ width: COL_W }}>
        {blocks.map((b) => (
          <div key={b.id} data-mid={b.id}>
            <BlockView block={b} />
          </div>
        ))}
      </div>
    </div>
  );

  return { leaves, measurer };
}

export { LeafView };
