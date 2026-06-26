import { expect, test } from 'vitest';
import { eventsDigest } from '@/lib/agents/suggestions';
import type { Findings } from '@/lib/tako/tools';

test('eventsDigest dedupes titles across web + cards and keeps publish dates', () => {
  const f = {
    cards: [{ title: 'Fed holds rates' }, { title: 'Gold hits record' }],
    web: [
      { title: 'Fed holds rates', publish_date: '2026-06-26' },
      { title: 'NBA Finals tonight', publish_date: null },
    ],
  } as unknown as Findings;

  const out = eventsDigest(f);
  expect(out).toContain('- Fed holds rates (2026-06-26)');
  expect(out).toContain('- NBA Finals tonight');
  expect(out).toContain('- Gold hits record');
  // "Fed holds rates" appears once even though it is in both web and cards.
  expect(out.match(/Fed holds rates/g)).toHaveLength(1);
});

test('eventsDigest caps the number of lines and ignores blank titles', () => {
  const web = Array.from({ length: 30 }, (_, i) => ({ title: `Story ${i}`, publish_date: null }));
  const f = { cards: [{ title: '   ' }], web } as unknown as Findings;
  expect(eventsDigest(f, 5).split('\n')).toHaveLength(5);
});
