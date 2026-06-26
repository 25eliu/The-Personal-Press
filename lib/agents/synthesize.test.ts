import { expect, test } from 'vitest';
import { bundlesContext, processBundles, synthInput, type TSynthBundle } from '@/lib/agents/synthesize';
import { todayContext } from '@/lib/time/clock';
import type { Findings } from '@/lib/tako/tools';

const today = todayContext(new Date('2026-06-25T00:00:00Z'));

function bundle(title: string, dates: (string | undefined)[]): TSynthBundle {
  return {
    title, summary: 's',
    dataPoints: [{ label: 'l', value: 'v', sourceName: 'Tako' }],
    narrative: dates.map((d) => ({ point: 'p', sourceName: 'BBC', date: d })),
    sources: [{ name: 'BBC', url: 'https://bbc.com/x' }],
  };
}

test('processBundles drops stale bundles when a fresh one exists', () => {
  const out = processBundles([bundle('old', ['2026-05-01']), bundle('new', ['2026-06-24'])], today);
  expect(out.map((b) => b.title)).toEqual(['new']);
  expect(out[0].isFresh).toBe(true);
});

test('processBundles ranks fresh-first by recency', () => {
  const out = processBundles(
    [bundle('a', ['2026-06-20']), bundle('b', ['2026-06-24']), bundle('c', ['2026-06-22'])],
    today,
  );
  expect(out.map((b) => b.title)).toEqual(['b', 'c', 'a']);
});

test('fork (b): all-stale keeps best-available, least-stale first, stamped as-of', () => {
  const out = processBundles([bundle('older', ['2026-05-01']), bundle('newer', ['2026-06-10'])], today);
  expect(out.map((b) => b.title)).toEqual(['newer', 'older']); // 15d before 55d
  expect(out.every((b) => b.isFresh)).toBe(false);
  expect(out[0].asOf).toBe('as of Jun 10, 2026');
});

test('undated bundles (live Tako cards) are treated as current', () => {
  const out = processBundles([bundle('live', [undefined])], today);
  expect(out[0].isFresh).toBe(true);
  expect(out[0].newestDate).toBeUndefined();
  expect(out[0].asOf).toBeUndefined();
});

test('synthInput surfaces publish_date and relevance', () => {
  const findings: Findings = {
    cards: [{ title: 'Rate', description: 'd', relevance: 'High', webpage_url: 'https://trytako.com/c/' }] as any,
    web: [{ title: 'Fed holds', snippet: 's', url: 'https://bbc.com/x', source_name: 'BBC', publish_date: '2026-06-24' }] as any,
    answers: [],
  };
  const ctx = synthInput(findings);
  expect(ctx).toContain('2026-06-24');
  expect(ctx).toContain('High');
});

test('bundlesContext serializes computed freshness fields', () => {
  const out = processBundles([bundle('new', ['2026-06-24'])], today);
  const ctx = bundlesContext(out);
  expect(ctx).toContain('"isFresh": true');
  expect(ctx).toContain('2026-06-24');
});
