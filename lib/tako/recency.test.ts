import { expect, test } from 'vitest';
import { timeAwareQuery } from '@/lib/tako/recency';
import { todayContext } from '@/lib/time/clock';

const today = todayContext(new Date('2026-06-25T00:00:00Z'));

test('appends the current year to a query with no year', () => {
  expect(timeAwareQuery('FIFA', today)).toBe('FIFA 2026');
});

test('leaves a query that already names a year unchanged', () => {
  expect(timeAwareQuery('FIFA World Cup 2026 standings', today)).toBe('FIFA World Cup 2026 standings');
  expect(timeAwareQuery('2022 World Cup final', today)).toBe('2022 World Cup final');
});

test('is idempotent — re-running on its own output is a no-op', () => {
  const once = timeAwareQuery('inflation rate', today);
  expect(timeAwareQuery(once, today)).toBe(once);
});

test('trims and tolerates empty input', () => {
  expect(timeAwareQuery('  FIFA  ', today)).toBe('FIFA 2026');
  expect(timeAwareQuery('   ', today)).toBe('');
});
