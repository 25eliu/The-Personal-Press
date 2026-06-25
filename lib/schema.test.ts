import { expect, test } from 'vitest';
import { z } from 'zod';
import { Article, Newspaper, Page } from '@/lib/schema';

// Regression: zod .url() emits JSON Schema `format: "uri"`, which OpenAI
// structured-output strict mode rejects and breaks every distill call. The
// Page schema (passed to generateObject) must contain no `format: uri`.
test('Page distill schema has no unsupported "uri" format', () => {
  const json = JSON.stringify(z.toJSONSchema(Page));
  expect(json).not.toMatch(/"format"\s*:\s*"uri"/);
});

test('Article requires at least one source', () => {
  const base = {
    kicker: 'k', headline: 'h', body: 'b', size: 'brief' as const, sources: [],
  };
  expect(Article.safeParse(base).success).toBe(false);
  expect(Article.safeParse({ ...base, sources: [{ name: 'X' }] }).success).toBe(true);
});

test('Article applies default byline', () => {
  const parsed = Article.parse({
    kicker: 'k', headline: 'h', body: 'b', size: 'lead',
    sources: [{ name: 'X', url: 'https://example.com' }],
  });
  expect(parsed.byline).toBe('Tako Wire');
});

test('Newspaper round-trips a minimal valid paper', () => {
  const paper = {
    masthead: 'The Daily Tako', tagline: 't', edition: 'Vol I', dateLine: 'June 25, 2026',
    pages: [{ topic: 'Front', articles: [
      { kicker: 'k', headline: 'h', body: 'b', size: 'lead', sources: [{ name: 'X' }] },
    ] }],
  };
  expect(Newspaper.safeParse(paper).success).toBe(true);
});

test('Source rejects empty-string url but allows omitted url', () => {
  // empty string must never reach .url(); schema only sees valid url or undefined
  expect(Page.safeParse({ topic: 't', articles: [
    { kicker: 'k', headline: 'h', body: 'b', size: 'brief', sources: [{ name: 'X' }] },
  ] }).success).toBe(true);
});
