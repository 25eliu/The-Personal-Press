import { expect, test, vi } from 'vitest';

vi.mock('@/lib/agents/editor', () => ({
  runEditor: vi.fn(async () => ({
    masthead: 'The Daily Tako', tagline: 't', edition: 'e', dateLine: 'd',
    sections: [{ topic: 'Front' }, { topic: 'Fed' }],
  })),
}));
vi.mock('@/lib/agents/reporter', () => ({
  runReporter: vi.fn(async (topic: string) => ({
    topic, articles: [{ kicker: 'k', headline: `H ${topic}`, body: 'b', size: 'brief', byline: 'Tako Wire', sources: [{ name: 'X' }] }],
  })),
  hasRealContent: (p: { articles: { headline: string }[] }) =>
    p.articles.some((a) => a.headline !== 'No fresh reporting on the wire'),
}));

import { orchestrate } from '@/lib/agents/orchestrate';
import type { GenerateEvent } from '@/lib/stream/events';

test('orchestrate emits editor_done, per-section events, and a complete paper in order', async () => {
  const events: GenerateEvent[] = [];
  await orchestrate('brief', (e) => events.push(e));

  expect(events[0].type).toBe('editor_done');
  const types = events.map((e) => e.type);
  expect(types).toContain('section_started');
  expect(types).toContain('section_done');

  const done = events.find((e) => e.type === 'complete');
  expect(done).toBeDefined();
  if (done && done.type === 'complete') {
    expect(done.newspaper.pages.map((p) => p.topic)).toEqual(['Front', 'Fed']);
    expect(done.newspaper.masthead).toBe('The Daily Tako');
  }
});
