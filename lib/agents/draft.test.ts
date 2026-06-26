import { expect, test } from 'vitest';
import { draftFromPartial } from '@/lib/agents/draft';

test('draftFromPartial joins headline + body per article in order', () => {
  expect(draftFromPartial(undefined)).toBe('');
  expect(draftFromPartial({ articles: [{ headline: 'Mortgage Rates Hold' }] })).toBe('Mortgage Rates Hold');
  expect(draftFromPartial({ articles: [
    { headline: 'A', body: 'alpha' },
    { headline: 'B', body: 'beta' },
  ] })).toBe('A\n\nalpha\n\nB\n\nbeta');
});

test('draftFromPartial output only grows as fields fill (prefix-stable)', () => {
  const a = draftFromPartial({ articles: [{ headline: 'Head' }] });
  const b = draftFromPartial({ articles: [{ headline: 'Head', body: 'body text' }] });
  expect(b.startsWith(a)).toBe(true);
});
