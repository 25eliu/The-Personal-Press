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

test('runEditor clamps sections to MAX_PAGES', async () => {
  const plan = await runEditor('AI, the Fed, football');
  expect(plan.sections.length).toBe(5);
  // masthead is forced to the fixed brand, overriding whatever the model returns
  expect(plan.masthead).toBe('The Personal Press');
});
