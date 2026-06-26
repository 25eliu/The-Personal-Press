import { expect, test } from 'vitest';
import { attachArt, distillPrompt, emptyPage, findingsContext, researchPrompt, sanitizePage } from '@/lib/agents/reporter';
import { todayContext } from '@/lib/time/clock';
import type { Findings } from '@/lib/tako/tools';
import type { TPage } from '@/lib/schema';

const findings: Findings = {
  cards: [{
    title: 'US Federal Funds Rate', description: 'Latest 3.6%',
    image_url: 'https://trytako.com/img/abc', embed_url: 'https://trytako.com/embed/abc',
    webpage_url: 'https://trytako.com/card/abc/',
    sources: [{ source_name: 'St. Louis Fed', source_description: null, source_index: 'tako', url: '' }],
  }] as any,
  web: [{ title: 'Fed holds rates', url: 'https://bbc.com/x', snippet: 's', source_name: 'BBC' }] as any,
};

test('findingsContext includes card titles and web titles', () => {
  const ctx = findingsContext(findings);
  expect(ctx).toContain('US Federal Funds Rate');
  expect(ctx).toContain('Fed holds rates');
});

test('attachArt fills missing chart art from a title-matching card', () => {
  const page: TPage = { topic: 'The Fed', articles: [
    { kicker: 'Rates', headline: 'Federal Funds Rate holds', body: 'b', size: 'lead', byline: 'Tako Wire',
      sources: [{ name: 'St. Louis Fed', url: 'https://trytako.com/card/abc/' }] },
  ] };
  const out = attachArt(page, findings);
  expect(out.articles[0].chartImageUrl).toBe('https://trytako.com/img/abc');
  expect(page.articles[0].chartImageUrl).toBeUndefined(); // immutability
});

const article = (headline: string, kicker = ''): any => ({
  kicker, headline, body: 'b', size: 'standard', byline: 'Tako Wire', sources: [{ name: 'X' }],
});
const card = (title: string, img: string): any => ({
  title, description: '', image_url: `https://trytako.com/img/${img}`, embed_url: undefined,
  webpage_url: `https://trytako.com/c/${img}`, sources: [],
});

test('attachArt never gives the same card to two articles in a section', () => {
  // Both stories share the "rates" keyword and there is only ONE card — only one may take it.
  const page: TPage = { topic: 'The Fed', articles: [
    article('Federal Funds Rate holds steady', 'Rates'),
    article('Markets weigh the Federal Funds Rate path', 'Rates'),
  ] };
  const f: Findings = { cards: [card('US Federal Funds Rate', 'one')], web: [] };
  const out = attachArt(page, f);
  const charted = out.articles.filter((a) => a.chartImageUrl);
  expect(charted).toHaveLength(1);
  expect(charted[0].chartImageUrl).toBe('https://trytako.com/img/one');
});

test('attachArt hands two distinct cards to two articles, ignoring a duplicate in the pool', () => {
  const page: TPage = { topic: 'Economy', articles: [
    article('Inflation cools further', 'Inflation'),
    article('Unemployment ticks up', 'Unemployment'),
  ] };
  const f: Findings = { cards: [
    card('US Inflation rate', 'infl'),
    card('US Inflation rate', 'infl'),        // same image_url returned twice by Tako
    card('US Unemployment rate', 'unemp'),
  ], web: [] };
  const out = attachArt(page, f);
  expect(out.articles[0].chartImageUrl).toBe('https://trytako.com/img/infl');
  expect(out.articles[1].chartImageUrl).toBe('https://trytako.com/img/unemp');
  const imgs = out.articles.map((a) => a.chartImageUrl);
  expect(new Set(imgs).size).toBe(imgs.length); // all distinct
});

test('attachArt leaves an existing chart in place and does not reuse its image elsewhere', () => {
  const page: TPage = { topic: 'Economy', articles: [
    { ...article('Inflation cools further', 'Inflation'), chartImageUrl: 'https://trytako.com/img/infl' },
    article('Prices in focus as Inflation eases', 'Inflation'),
  ] };
  const f: Findings = { cards: [card('US Inflation rate', 'infl')], web: [] };
  const out = attachArt(page, f);
  expect(out.articles[0].chartImageUrl).toBe('https://trytako.com/img/infl'); // untouched
  expect(out.articles[1].chartImageUrl).toBeUndefined();                      // not re-handed
});

test('emptyPage degrades gracefully with one sourced brief', () => {
  const p = emptyPage('Quiet Topic');
  expect(p.topic).toBe('Quiet Topic');
  expect(p.articles).toHaveLength(1);
  expect(p.articles[0].size).toBe('brief');
  expect(p.articles[0].sources.length).toBeGreaterThanOrEqual(1);
});

test('sanitizePage strips javascript:/data: URLs from chart art and sources', () => {
  const page = { topic: 'T', articles: [{
    kicker: 'k', headline: 'h', body: 'b', size: 'brief' as const, byline: 'Tako Wire',
    chartImageUrl: 'javascript:alert(1)',
    chartEmbedUrl: 'data:text/html,<script>x</script>',
    sources: [{ name: 'Evil', url: 'javascript:alert(2)' }, { name: 'Good', url: 'https://ok.com/x' }],
  }] };
  const out = sanitizePage(page as any);
  expect(out.articles[0].chartImageUrl).toBeUndefined();
  expect(out.articles[0].chartEmbedUrl).toBeUndefined();
  expect(out.articles[0].sources[0]).toEqual({ name: 'Evil' });        // bad url dropped, name kept
  expect(out.articles[0].sources[1]).toEqual({ name: 'Good', url: 'https://ok.com/x' });
  expect((page.articles[0] as any).chartImageUrl).toBe('javascript:alert(1)'); // input unmutated
});

test('sanitizePage keeps valid https chart art', () => {
  const page = { topic: 'T', articles: [{
    kicker: 'k', headline: 'h', body: 'b', size: 'brief' as const, byline: 'Tako Wire',
    chartImageUrl: 'https://trytako.com/img/x',
    sources: [{ name: 'S', url: 'https://s.com' }],
  }] };
  expect(sanitizePage(page as any).articles[0].chartImageUrl).toBe('https://trytako.com/img/x');
});

test('distillPrompt embeds grounding context when provided', () => {
  const today = todayContext(new Date('2026-06-25T00:00:00Z'));
  const withCtx = distillPrompt('Premier League transfers', false, '{}', today, 'Prior transfers article');
  expect(withCtx).toContain('EXISTING COVERAGE');
  expect(withCtx).toContain('Prior transfers article');
  const noCtx = distillPrompt('Premier League transfers', false, '{}', today);
  expect(noCtx).not.toContain('EXISTING COVERAGE');
});

test('researchPrompt embeds grounding context only when provided', () => {
  const today = todayContext(new Date('2026-06-25T00:00:00Z'));
  const withCtx = researchPrompt('Premier League transfers', today, 'Prior transfers article');
  expect(withCtx).toContain('EXISTING COVERAGE');
  expect(withCtx).toContain('Prior transfers article');
  expect(researchPrompt('Premier League transfers', today)).not.toContain('EXISTING COVERAGE');
});
