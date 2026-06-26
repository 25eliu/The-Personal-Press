import { expect, test } from 'vitest';
import { editionReducer, initialEditionState, type EditionState } from '@/lib/edition/state';
import type { TPage, TArticle } from '@/lib/schema';

function article(headline: string, over: Partial<TArticle> = {}): TArticle {
  return {
    kicker: 'Markets',
    headline,
    byline: 'Tako Wire',
    body: 'Body text.',
    size: 'standard',
    sources: [{ name: 'Reuters', url: 'https://reuters.com' }],
    ...over,
  };
}

function page(topic: string, headlines: string[]): TPage {
  return { topic, articles: headlines.map((h) => article(h)) };
}

function stateWith(pages: (TPage | null)[]): EditionState {
  return {
    meta: { masthead: 'The Personal Press', tagline: '', edition: '', dateLine: '' },
    plan: pages.map((p, slot) => ({ topic: p?.topic ?? `Page ${slot + 1}`, slot })),
    pages,
    history: [],
  };
}

test('SET_FROM_EDITOR seeds a null pages array sized to the plan', () => {
  const next = editionReducer(initialEditionState, {
    type: 'SET_FROM_EDITOR',
    meta: { masthead: 'X', tagline: 't', edition: 'e', dateLine: 'd' },
    plan: [{ topic: 'A', slot: 0 }, { topic: 'B', slot: 1 }],
  });
  expect(next.pages).toEqual([null, null]);
  expect(next.meta.masthead).toBe('X');
});

test('EDIT_ARTICLE patches one article immutably and records history', () => {
  const start = stateWith([page('Front', ['Old lead', 'Brief'])]);
  const next = editionReducer(start, {
    type: 'EDIT_ARTICLE',
    slot: 0,
    index: 0,
    patch: { headline: 'New lead' },
  });
  expect(next.pages[0]!.articles[0].headline).toBe('New lead');
  expect(next.pages[0]!.articles[1].headline).toBe('Brief');
  // original untouched (immutability)
  expect(start.pages[0]!.articles[0].headline).toBe('Old lead');
  expect(next.history).toHaveLength(1);
});

test('UNDO restores the previous snapshot', () => {
  const start = stateWith([page('Front', ['Old lead'])]);
  const edited = editionReducer(start, { type: 'EDIT_ARTICLE', slot: 0, index: 0, patch: { headline: 'New' } });
  const undone = editionReducer(edited, { type: 'UNDO' });
  expect(undone.pages[0]!.articles[0].headline).toBe('Old lead');
  expect(undone.history).toHaveLength(0);
});

test('REMOVE_ARTICLE drops the targeted article', () => {
  const start = stateWith([page('Front', ['A', 'B', 'C'])]);
  const next = editionReducer(start, { type: 'REMOVE_ARTICLE', slot: 0, index: 1 });
  expect(next.pages[0]!.articles.map((a) => a.headline)).toEqual(['A', 'C']);
});

test('ADD_SECTION appends a page and reindexes the plan', () => {
  const start = stateWith([page('Front', ['A'])]);
  const next = editionReducer(start, { type: 'ADD_SECTION', page: page('US GDP', ['Growth']) });
  expect(next.pages).toHaveLength(2);
  expect(next.plan).toEqual([
    { topic: 'Front', slot: 0 },
    { topic: 'US GDP', slot: 1 },
  ]);
});

test('REORDER_SECTIONS permutes pages and plan by current slot order', () => {
  const start = stateWith([page('Front', ['A']), page('Fed', ['B']), page('Sport', ['C'])]);
  const next = editionReducer(start, { type: 'REORDER_SECTIONS', order: [0, 2, 1] });
  expect(next.pages.map((p) => p!.topic)).toEqual(['Front', 'Sport', 'Fed']);
  expect(next.plan).toEqual([
    { topic: 'Front', slot: 0 },
    { topic: 'Sport', slot: 1 },
    { topic: 'Fed', slot: 2 },
  ]);
});

test('ADD_PULL_QUOTE maps to the article dek', () => {
  const start = stateWith([page('Front', ['A'])]);
  const next = editionReducer(start, { type: 'ADD_PULL_QUOTE', slot: 0, index: 0, quote: 'A coiled spring.' });
  expect(next.pages[0]!.articles[0].dek).toBe('A coiled spring.');
});

test('COMPLETE rebuilds meta/plan/pages from the finished newspaper', () => {
  const next = editionReducer(stateWith([null, null]), {
    type: 'COMPLETE',
    newspaper: {
      masthead: 'M', tagline: 'T', edition: 'E', dateLine: 'D',
      pages: [page('Front', ['Lead']), page('Fed', ['Policy'])],
    },
  });
  expect(next.meta).toEqual({ masthead: 'M', tagline: 'T', edition: 'E', dateLine: 'D' });
  expect(next.plan).toEqual([{ topic: 'Front', slot: 0 }, { topic: 'Fed', slot: 1 }]);
  expect(next.pages.map((p) => p!.topic)).toEqual(['Front', 'Fed']);
});
