import { expect, test } from 'vitest';
import { EXAMPLE_BRIEFS, isExampleBrief } from '@/lib/edition/examples';

test('isExampleBrief matches the suggested briefs, case/space-insensitively', () => {
  expect(isExampleBrief(EXAMPLE_BRIEFS[0])).toBe(true);
  expect(isExampleBrief('  AI Startups, the Fed, and the Premier League  ')).toBe(true);
});

test('isExampleBrief rejects anything that is not a suggested brief', () => {
  expect(isExampleBrief('something a reader typed')).toBe(false);
  expect(isExampleBrief('')).toBe(false);
});
