import { expect, test } from 'vitest';
import { distillPrompt, emptyPage, finalizePage, findingsContext, researchPrompt, sanitizePage } from '@/lib/agents/reporter';
import { todayContext } from '@/lib/time/clock';
import type { Findings } from '@/lib/tako/tools';
import type { TDraftPage } from '@/lib/schema';

const findings: Findings = {
  cards: [{
    title: 'US Federal Funds Rate', description: 'Latest 3.6%',
    image_url: 'https://trytako.com/img/abc', webpage_url: 'https://trytako.com/card/abc/',
    sources: [{ source_name: 'St. Louis Fed', source_description: null, source_index: 'tako', url: '' }],
  }] as any,
  web: [{ title: 'Fed holds rates', url: 'https://bbc.com/x', snippet: 's', source_name: 'BBC' }] as any,
  contents: [],
};

test('findingsContext includes card titles and web titles', () => {
  const ctx = findingsContext(findings);
  expect(ctx).toContain('US Federal Funds Rate');
  expect(ctx).toContain('Fed holds rates');
});

const article = (headline: string, kicker = ''): any => ({
  kicker, headline, body: 'b', size: 'standard', byline: 'Tako Wire', sources: [{ name: 'X' }],
});
const cardWithCsv = (title: string, slug: string, csv: string): { card: any; content: any } => ({
  card: { title, description: '', webpage_url: `https://trytako.com/c/${slug}`, sources: [] },
  content: { source_url: `https://trytako.com/c/${slug}`, format: 'csv', cost: 0, data: csv },
});

test('finalizePage turns a card CSV into a table + routed graphic on the matched article', () => {
  const { card, content } = cardWithCsv('US Federal Funds Rate', 'ffr', 'Year,Rate\n2023,5.3\n2024,4.6\n2025,3.6');
  const page: TDraftPage = { topic: 'The Fed', articles: [article('Federal Funds Rate path', 'Rates')] };
  const out = finalizePage(page, { cards: [card], web: [], contents: [content] });
  const a = out.articles[0];
  expect(a.table?.columns).toEqual(['Year', 'Rate']);
  expect(a.graphic?.kind).toBe('chart'); // dated label → a line/area chart
  if (a.graphic?.kind === 'chart') {
    expect(a.graphic.labelColumn).toBe('Year');
    expect(a.graphic.valueColumns).toEqual(['Rate']);
  }
  expect((a as any).chartImageUrl).toBeUndefined();  // never an image
  expect((page.articles[0] as any).graphic).toBeUndefined(); // immutability: draft is untouched
});

test('finalizePage keeps a model-transcribed table when no CSV card matches', () => {
  const page: TDraftPage = { topic: 'X', articles: [
    { ...article('Prices rose', 'Econ'), table: { caption: 'Prices', columns: ['Q', 'P'], rows: [['Q1', '10'], ['Q2', '12']] } },
  ] };
  const out = finalizePage(page, { cards: [], web: [], contents: [] });
  expect(out.articles[0].table?.columns).toEqual(['Q', 'P']);
  expect(out.articles[0].graphic?.kind).toBe('chart'); // a graphic is routed from the model table
});

test('finalizePage leaves no graphic when there is no table data at all', () => {
  const page: TDraftPage = { topic: 'X', articles: [
    { ...article('No data here', 'X'), chart: { type: 'bar', labelColumn: 'A', valueColumns: ['B'] } },
  ] };
  const out = finalizePage(page, { cards: [], web: [], contents: [] });
  expect(out.articles[0].graphic).toBeUndefined();
  expect(out.articles[0].table).toBeUndefined();
});

test('emptyPage degrades gracefully with one sourced brief', () => {
  const p = emptyPage('Quiet Topic');
  expect(p.topic).toBe('Quiet Topic');
  expect(p.articles).toHaveLength(1);
  expect(p.articles[0].size).toBe('brief');
  expect(p.articles[0].sources.length).toBeGreaterThanOrEqual(1);
});

test('sanitizePage strips javascript:/data: URLs from sources, keeping the name', () => {
  const page = { topic: 'T', articles: [{
    kicker: 'k', headline: 'h', body: 'b', size: 'brief' as const, byline: 'Tako Wire',
    sources: [{ name: 'Evil', url: 'javascript:alert(2)' }, { name: 'Good', url: 'https://ok.com/x' }],
  }] };
  const out = sanitizePage(page as any);
  expect(out.articles[0].sources[0]).toEqual({ name: 'Evil' });        // bad url dropped, name kept
  expect(out.articles[0].sources[1]).toEqual({ name: 'Good', url: 'https://ok.com/x' });
  expect((page.articles[0].sources[0] as any).url).toBe('javascript:alert(2)'); // input unmutated
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
