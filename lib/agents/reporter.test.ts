import { expect, test } from 'vitest';
import { attachArt, emptyPage, findingsContext } from '@/lib/agents/reporter';
import type { Findings } from '@/lib/tako/tools';

const findings: Findings = {
  cards: [{
    title: 'US Federal Funds Rate', description: 'Latest 3.6%',
    image_url: 'https://trytako.com/img/abc', embed_url: 'https://trytako.com/embed/abc',
    webpage_url: 'https://trytako.com/card/abc/',
    sources: [{ source_name: 'St. Louis Fed', source_description: null, source_index: 'tako', url: '' }],
  }] as any,
  web: [{ title: 'Fed holds rates', url: 'https://bbc.com/x', snippet: 's', source_name: 'BBC' }] as any,
  answers: ['The Fed held rates steady at 3.5–3.75%.'],
};

test('findingsContext includes card titles, web titles, and answers', () => {
  const ctx = findingsContext(findings);
  expect(ctx).toContain('US Federal Funds Rate');
  expect(ctx).toContain('Fed holds rates');
  expect(ctx).toContain('held rates steady');
});

test('attachArt fills missing chart art from a title-matching card', () => {
  const page = { topic: 'The Fed', articles: [
    { kicker: 'Rates', headline: 'Federal Funds Rate holds', body: 'b', size: 'lead' as const,
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
