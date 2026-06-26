import { expect, test, vi } from 'vitest';

vi.mock('ai', () => ({
  generateObject: vi.fn(async () => ({
    object: {
      masthead: 'Some Invented Name', tagline: 'All the data fit to print',
      edition: 'Vol. I, No. 1', dateLine: 'June 25, 2026',
      sections: Array.from({ length: 8 }, (_, i) => ({ topic: `T${i}` })),
    },
  })),
}));
vi.mock('@ai-sdk/openai', () => ({ openai: () => 'mock-model' }));

import { runEditor } from '@/lib/agents/editor';
import { todayContext } from '@/lib/time/clock';

const today = todayContext(new Date('2026-06-25T00:00:00Z'));

test('runEditor clamps sections to MAX_PAGES', async () => {
  const plan = await runEditor('AI, the Fed, football', today);
  expect(plan.sections.length).toBe(5);
  // masthead is forced to the fixed brand, overriding whatever the model returns
  expect(plan.masthead).toBe('The Personal Press');
});

test('runEditor overrides the model dateLine with the real date', async () => {
  const plan = await runEditor('AI', today);
  // model returned "June 25, 2026"; we force the real run-wide dateLine instead
  expect(plan.dateLine).toBe('Thursday, June 25, 2026');
});
