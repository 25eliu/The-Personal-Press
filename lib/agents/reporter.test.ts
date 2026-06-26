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
