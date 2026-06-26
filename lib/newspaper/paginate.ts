import type { TPage } from '@/lib/schema';
import { type Block, flattenTopic } from './blocks';
import { CONTENT_H } from './leafLayout';

/** One printed sheet: a topic (or part of one) laid into the fixed leaf box. */
export interface Leaf {
  topicIndex: number;
  topic: string;
  isFront: boolean; // the very first leaf — renders the masthead instead of a topic bar
  columns: [Block[], Block[]]; // left + right text columns
  partIndex: number; // 0-based, this leaf's position within its topic
  partCount: number; // total leaves the topic occupies
  folio: number; // 1-based page number across the whole paper (set in packAll)
  continuesToNext: boolean; // an article spills onto the next leaf → "Continued on page X"
  continuesFromPrev: boolean; // an article arrives from the previous leaf → "Continued from page Y"
  continuedToPage?: number;
  continuedFromPage?: number;
}

export type HeightOf = (block: Block) => number;

/**
 * Greedy column packer for a single topic. Fills the left column to capacity, then
 * the right column, then starts a fresh leaf — keeping article heads with their
 * first paragraph and only ever splitting a story between paragraphs. A split that
 * crosses a leaf boundary is flagged so the renderer can print the jump lines.
 */
function packTopic(
  blocks: Block[],
  heightOf: HeightOf,
  capForLeaf: (localIdx: number) => number,
  isFrontTopic: boolean,
  topic: string,
  topicIndex: number,
): Leaf[] {
  const leaves: Leaf[] = [];
  let localIdx = 0;
  let columns: [Block[], Block[]] = [[], []];
  let col = 0;
  let used = 0;
  let cap = capForLeaf(0);
  let pendingFrom = false; // the leaf we're about to open continues an article
  let curFromPrev = false; // the leaf we're filling continues an article
  let lastKey: string | null = null;

  const openLeaf = () => {
    columns = [[], []];
    col = 0;
    used = 0;
    cap = capForLeaf(localIdx);
    curFromPrev = pendingFrom;
    pendingFrom = false;
  };

  const closeLeaf = (continuesToNext: boolean) => {
    leaves.push({
      topicIndex,
      topic,
      isFront: isFrontTopic && localIdx === 0,
      columns,
      partIndex: localIdx,
      partCount: 0,
      folio: 0,
      continuesToNext,
      continuesFromPrev: curFromPrev,
    });
    localIdx += 1;
  };

  openLeaf();

  for (let i = 0; i < blocks.length; i++) {
    const b = blocks[i];
    const bh = heightOf(b);

    // Keep an article head with its first following block (no orphan headlines).
    if (b.kind === 'head' && i + 1 < blocks.length && used > 0) {
      const nh = heightOf(blocks[i + 1]);
      if (used + bh + nh > cap) {
        if (col === 0) {
          col = 1;
          used = 0;
        } else {
          closeLeaf(false);
          pendingFrom = false;
          openLeaf();
        }
      }
    }

    const fits = used + bh <= cap;

    if (fits) {
      columns[col].push(b);
      used += bh;
    } else if (col === 0) {
      // Overflow the left column → continue in the right column (same page, so no
      // jump line). Tall lone blocks are placed anyway and forced to fill.
      col = 1;
      columns[1].push(b);
      used = bh <= cap ? bh : cap;
    } else {
      // Both columns full → open the next leaf. If this block is a paragraph of the
      // article we were just setting, the story is being split across the page.
      const split = b.kind === 'para' && b.articleKey === lastKey;
      closeLeaf(split);
      pendingFrom = split;
      openLeaf();
      columns[0].push(b);
      used = bh <= cap ? bh : cap;
    }

    lastKey = b.articleKey;
  }

  closeLeaf(false);
  leaves.forEach((lf) => (lf.partCount = leaves.length));
  return leaves;
}

/**
 * Paginate the whole paper. Each topic starts on a fresh leaf (so every page has a
 * clean single-topic label) and flows across as many identical leaves as it needs.
 * Returns leaves in reading order with folios and resolved "continued" page refs.
 */
export function packAll(
  pages: TPage[],
  heightOf: HeightOf,
  mastheadH: number,
  topicbarH: number,
): Leaf[] {
  const all: Leaf[] = [];

  pages.forEach((page, ti) => {
    const isFront = ti === 0;
    const capForLeaf = (localIdx: number) =>
      isFront && localIdx === 0 ? CONTENT_H - mastheadH : CONTENT_H - topicbarH;
    const blocks = flattenTopic(page, ti);
    all.push(...packTopic(blocks, heightOf, capForLeaf, isFront, page.topic, ti));
  });

  all.forEach((lf, i) => {
    lf.folio = i + 1;
  });
  all.forEach((lf, i) => {
    if (lf.continuesToNext) lf.continuedToPage = all[i + 1]?.folio;
    if (lf.continuesFromPrev) lf.continuedFromPage = all[i - 1]?.folio;
  });

  return all;
}
