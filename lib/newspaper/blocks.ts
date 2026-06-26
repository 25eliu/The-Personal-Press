import type { TArticle, TPage } from '@/lib/schema';

/**
 * A Block is the smallest unit the paginator places on a leaf. An article is
 * shredded into ordered blocks — its head (kicker/headline/dek/byline), an
 * optional figure, each body paragraph, an optional table, and its source line —
 * so the column packer can break BETWEEN paragraphs and let a long story flow
 * onto the next page, exactly like real newsprint. Paragraphs are the only places
 * an article is allowed to split; everything else stays whole.
 */
export type BlockKind = 'head' | 'figure' | 'para' | 'table' | 'sources';

export interface Block {
  id: string; // stable key, also used to look up the measured height
  topicIndex: number;
  topic: string;
  articleKey: string; // identifies the owning article, for "continued" detection
  articleIndex: number; // 0-based position of the owning article within its page (0 = lead)
  kind: BlockKind;
  article: TArticle;
  paraIndex: number; // 0 for non-paragraph blocks
  text?: string; // paragraph text (para blocks only)
  isLeadFirstPara: boolean; // first paragraph of a lead story → gets the drop cap
}

/** Split a body into clean, non-empty paragraphs. */
export function paragraphs(body: string): string[] {
  return body.split('\n').map((s) => s.trim()).filter(Boolean);
}

/** Shred one topic (schema page) into an ordered block stream. */
export function flattenTopic(page: TPage, topicIndex: number): Block[] {
  const blocks: Block[] = [];
  page.articles.forEach((article, ai) => {
    const articleKey = `${topicIndex}-${ai}`;
    const add = (kind: BlockKind, paraIndex = 0, text?: string, isLeadFirstPara = false) =>
      blocks.push({
        id: `${articleKey}-${kind}-${paraIndex}`,
        topicIndex,
        topic: page.topic,
        articleKey,
        articleIndex: ai,
        kind,
        article,
        paraIndex,
        text,
        isLeadFirstPara,
      });

    add('head');
    if (article.chartImageUrl) add('figure');
    paragraphs(article.body).forEach((para, pi) =>
      add('para', pi, para, article.size === 'lead' && pi === 0),
    );
    if (article.table) add('table');
    add('sources');
  });
  return blocks;
}
