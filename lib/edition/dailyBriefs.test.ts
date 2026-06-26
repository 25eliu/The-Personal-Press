import { expect, test } from 'vitest';
import { isSuggestedBrief } from '@/lib/edition/dailyBriefs';
import { EXAMPLE_POOL } from '@/lib/edition/examples';

// With no localStorage (node env), isSuggestedBrief falls back to the static pool.
test('isSuggestedBrief matches the static pool, case/space-insensitively', () => {
  expect(isSuggestedBrief(EXAMPLE_POOL[0])).toBe(true);
  expect(isSuggestedBrief(`  ${EXAMPLE_POOL[1].toUpperCase()}  `)).toBe(true);
});

test('isSuggestedBrief rejects an arbitrary typed brief', () => {
  expect(isSuggestedBrief('something a reader typed')).toBe(false);
  expect(isSuggestedBrief('')).toBe(false);
});
