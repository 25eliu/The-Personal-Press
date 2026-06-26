import { expect, test } from 'vitest';
import { daysAgo, freshnessLabel, freshnessScore, isStale, newestDate } from '@/lib/freshness';
import { todayContext } from '@/lib/time/clock';

const today = todayContext(new Date('2026-06-25T00:00:00Z'));

test('daysAgo computes whole days; null when missing/unparseable', () => {
  expect(daysAgo('2026-06-25', today)).toBe(0);
  expect(daysAgo('2026-06-20', today)).toBe(5);
  expect(daysAgo('2026-05-25', today)).toBe(31);
  expect(daysAgo(null, today)).toBeNull();
  expect(daysAgo('not-a-date', today)).toBeNull();
});

test('isStale: within 7d fresh, beyond stale, undated neutral', () => {
  expect(isStale('2026-06-20', today)).toBe(false); // 5d
  expect(isStale('2026-06-18', today)).toBe(false); // 7d, at the edge
  expect(isStale('2026-06-17', today)).toBe(true);  // 8d
  expect(isStale(undefined, today)).toBe(false);    // undated never auto-stale
});

test('freshnessScore orders fresh > undated > stale', () => {
  const fresh = freshnessScore('2026-06-24', today); // 1d
  const undated = freshnessScore(null, today);
  const stale = freshnessScore('2026-06-01', today); // 24d
  expect(fresh).toBeGreaterThan(undated);
  expect(undated).toBeGreaterThan(stale);
  // fresher beats less-fresh; less-stale beats more-stale
  expect(freshnessScore('2026-06-25', today)).toBeGreaterThan(fresh);
  expect(stale).toBeGreaterThan(freshnessScore('2026-05-01', today));
});

test('freshnessLabel only stamps stale dated sources', () => {
  expect(freshnessLabel('2026-06-24', today)).toBeUndefined(); // fresh
  expect(freshnessLabel(undefined, today)).toBeUndefined();    // undated
  expect(freshnessLabel('2026-06-01', today)).toBe('as of Jun 1, 2026');
});

test('newestDate returns the most recent dated entry', () => {
  expect(newestDate(['2026-06-01', '2026-06-24', null, '2026-05-30'], today)).toBe('2026-06-24');
  expect(newestDate([null, undefined], today)).toBeUndefined();
});
