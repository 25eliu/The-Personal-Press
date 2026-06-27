import { describe, expect, it } from 'vitest';
import type { TPage } from '@/lib/schema';
import { type Block } from './blocks';
import { packAll } from './paginate';
import { CONTENT_H } from './leafLayout';

// Synthetic page builders — content is irrelevant; only the block stream + heights
// drive pagination, so we control heights directly via heightOf below.
function article(headline: string, paras: number, size: TPage['articles'][number]['size'] = 'standard') {
  return {
    kicker: 'KICKER',
    headline,
    byline: 'Tako Wire',
    body: Array.from({ length: paras }, (_, i) => `Paragraph ${i + 1}`).join('\n'),
    size,
    sources: [{ name: 'Source' }],
  };
}

// Fixed per-kind heights. With CONTENT_H ~772 and topicbar ~50 → ~722 per column,
// 200px paragraphs mean ~3 per column, ~6 per leaf → easy multi-leaf topics.
const HEIGHT: Record<Block['kind'], number> = {
  head: 120,
  chart: 180,
  para: 200,
  table: 150,
  sources: 60,
};
const heightOf = (b: Block) => HEIGHT[b.kind];
const MASTHEAD_H = 300;
const TOPICBAR_H = 50;

describe('packAll', () => {
  it('keeps every leaf the same fixed size by construction (capacity never exceeded per column)', () => {
    const pages: TPage[] = [{ topic: 'Front', articles: [article('Lead', 12, 'lead')] }];
    const leaves = packAll(pages, heightOf, MASTHEAD_H, TOPICBAR_H);

    expect(leaves.length).toBeGreaterThan(1); // 12 paras can't fit one leaf
    leaves.forEach((lf) => {
      const cap = lf.isFront ? CONTENT_H - MASTHEAD_H : CONTENT_H - TOPICBAR_H;
      lf.columns.forEach((col) => {
        const total = col.reduce((s, b) => s + heightOf(b), 0);
        // Each column is packed to fit its capacity (a lone over-tall block is the
        // only exception, and we have none here).
        expect(total).toBeLessThanOrEqual(cap + 0.5);
      });
    });
  });

  it('numbers folios sequentially and labels parts within a topic', () => {
    const pages: TPage[] = [{ topic: 'Markets', articles: [article('Big', 20)] }];
    const leaves = packAll(pages, heightOf, MASTHEAD_H, TOPICBAR_H);

    leaves.forEach((lf, i) => expect(lf.folio).toBe(i + 1));
    leaves.forEach((lf) => {
      expect(lf.partCount).toBe(leaves.length);
      expect(lf.partIndex).toBeGreaterThanOrEqual(0);
      expect(lf.partIndex).toBeLessThan(lf.partCount);
    });
  });

  it('emits matching "continued on/from" page refs when a story splits across leaves', () => {
    const pages: TPage[] = [{ topic: 'News', articles: [article('Sprawling', 20)] }];
    const leaves = packAll(pages, heightOf, MASTHEAD_H, TOPICBAR_H);

    const splitters = leaves.filter((lf) => lf.continuesToNext);
    expect(splitters.length).toBeGreaterThan(0); // one article over 20 paras must split

    splitters.forEach((lf) => {
      const next = leaves[lf.folio]; // folio is 1-based → leaves[folio] is the next leaf
      expect(lf.continuedToPage).toBe(next.folio);
      expect(next.continuesFromPrev).toBe(true);
      expect(next.continuedFromPage).toBe(lf.folio);
    });
  });

  it('starts each topic on a fresh leaf — no leaf mixes two topics', () => {
    const pages: TPage[] = [
      { topic: 'Front', articles: [article('A', 3, 'lead')] },
      { topic: 'Sports', articles: [article('B', 3)] },
      { topic: 'World', articles: [article('C', 3)] },
    ];
    const leaves = packAll(pages, heightOf, MASTHEAD_H, TOPICBAR_H);

    expect(leaves.length).toBeGreaterThanOrEqual(3);
    leaves.forEach((lf) => {
      const ids = new Set(lf.columns.flat().map((b) => b.topicIndex));
      expect(ids.size).toBeLessThanOrEqual(1); // a leaf carries exactly one topic
    });
    // First leaf of the paper is the masthead/front leaf.
    expect(leaves[0].isFront).toBe(true);
  });
});
