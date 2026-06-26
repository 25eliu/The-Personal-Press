import { expect, test } from 'vitest';
import { sectionToContext, shortSectionTitle } from '@/lib/edition/grounding';

test('shortSectionTitle keeps the label before a colon', () => {
  expect(shortSectionTitle('Summer football transfers: explain the major moves and spending'))
    .toBe('Summer football transfers');
});
test('shortSectionTitle leaves an already-short title unchanged', () => {
  expect(shortSectionTitle('Premier League Summer Transfers 2026')).toBe('Premier League Summer Transfers 2026');
});
test('shortSectionTitle caps a long colon-less topic to a few words', () => {
  const long = 'how the summer transfer window works across every major european league this year and beyond';
  expect(shortSectionTitle(long).length).toBeLessThanOrEqual(56);
});

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
