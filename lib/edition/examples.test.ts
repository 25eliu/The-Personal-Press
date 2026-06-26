import { expect, test } from 'vitest';
import { EXAMPLE_BRIEFS, EXAMPLE_POOL, getDailyBriefs, isExampleBrief, PINNED_BRIEF } from '@/lib/edition/examples';

const DAY_MS = 24 * 60 * 60 * 1000;

test('isExampleBrief matches the suggested briefs, case/space-insensitively', () => {
  expect(isExampleBrief(EXAMPLE_BRIEFS[0])).toBe(true);
  expect(isExampleBrief('  AI Startups, the Fed, the Premier League  ')).toBe(true);
});

test('the pinned brief leads the pool and is comma-separated (no "and")', () => {
  expect(EXAMPLE_POOL[0]).toBe(PINNED_BRIEF);
  expect(PINNED_BRIEF).toBe('fifa, developer news, stocks');
  expect(EXAMPLE_POOL.every((b) => !/\band\b/.test(b))).toBe(true);
});

test('isExampleBrief rejects anything that is not a suggested brief', () => {
  expect(isExampleBrief('something a reader typed')).toBe(false);
  expect(isExampleBrief('')).toBe(false);
});

test('getDailyBriefs returns a stable trio of distinct, pooled briefs for a given day', () => {
  const day = getDailyBriefs(5 * DAY_MS);
  expect(day).toHaveLength(3);
  expect(new Set(day).size).toBe(3);
  expect(day.every((b) => EXAMPLE_POOL.includes(b as (typeof EXAMPLE_POOL)[number]))).toBe(true);
  // Same calendar day (different time of day) → identical lineup.
  expect(getDailyBriefs(5 * DAY_MS + 1000)).toEqual(day);
});

test('getDailyBriefs rotates the lineup from one day to the next', () => {
  expect(getDailyBriefs(5 * DAY_MS)).not.toEqual(getDailyBriefs(6 * DAY_MS));
});

test('getDailyBriefs cycles through the whole pool over time', () => {
  const seen = new Set<string>();
  for (let d = 0; d < EXAMPLE_POOL.length; d++) {
    getDailyBriefs(d * DAY_MS).forEach((b) => seen.add(b));
  }
  expect(seen.size).toBe(EXAMPLE_POOL.length);
});
