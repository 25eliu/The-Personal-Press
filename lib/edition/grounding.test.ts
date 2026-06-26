import { expect, test } from 'vitest';
import { sectionToContext } from '@/lib/edition/grounding';

test('sectionToContext serializes topic + article headlines/bodies', () => {
  const ctx = sectionToContext({
    topic: 'Football',
    articles: [
      { kicker: 'Transfers', headline: 'Summer Window Opens', byline: 'Wire', body: 'Clubs spend big.', size: 'standard', sources: [{ name: 'BBC' }] },
    ],
  });
  expect(ctx).toContain('Football');
  expect(ctx).toContain('Summer Window Opens');
  expect(ctx).toContain('Clubs spend big.');
});
