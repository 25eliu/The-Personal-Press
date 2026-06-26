import { expect, test } from 'vitest';
import { articleToContext, sectionToContext, shortSectionTitle } from '@/lib/edition/grounding';
import type { TArticle } from '@/lib/schema';

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

const oilStory: TArticle = {
  kicker: 'Markets', headline: 'Oil slips on demand worries', dek: 'Crude eases as Asia softens',
  byline: 'Tako Wire', body: 'Brent fell as traders weighed weaker demand against tight supply.',
  size: 'standard', sources: [{ name: 'EIA' }],
};

test('articleToContext scopes grounding to a single story under its section', () => {
  const ctx = articleToContext(oilStory, 'Energy Markets');
  expect(ctx).toContain('Section topic: "Energy Markets"');
  expect(ctx).toContain('Existing story to update:');
  expect(ctx).toContain('- Oil slips on demand worries — Crude eases as Asia softens');
  expect(ctx).toContain(oilStory.body);
  // Narrow, not the whole-page serialization.
  expect(ctx).not.toContain('Existing articles:');
});

test('articleToContext omits the dash when there is no dek', () => {
  const ctx = articleToContext({ ...oilStory, dek: undefined }, 'Energy Markets');
  expect(ctx).toContain('- Oil slips on demand worries\n');
  expect(ctx).not.toContain('—');
});
