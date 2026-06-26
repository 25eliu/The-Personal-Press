import { expect, test } from 'vitest';
import { buildTakoTools, collectFindings } from '@/lib/tako/tools';
import { todayContext } from '@/lib/time/clock';

const today = todayContext(new Date('2026-06-25T00:00:00Z'));

test('buildTakoTools returns only search + contents (no redundant tako_answer)', () => {
  const tools = buildTakoTools(today);
  expect(Object.keys(tools).sort()).toEqual(['tako_contents', 'tako_search']);
});

test('collectFindings accumulates cards and web results from steps', () => {
  const steps = [
    { toolResults: [
      { toolName: 'tako_search', output: {
        cards: [{ title: 'A' }], web_results: [{ title: 'W1', url: 'https://x/1' }],
      } },
    ] },
    { toolResults: [
      { toolName: 'tako_search', output: {
        cards: [{ title: 'B' }], web_results: [],
      } },
    ] },
  ] as any;
  const f = collectFindings(steps);
  expect(f.cards.map((c) => c.title)).toEqual(['A', 'B']);
  expect(f.web.map((w) => w.title)).toEqual(['W1']);
});

test('collectFindings tolerates empty/missing steps', () => {
  expect(collectFindings([] as any)).toEqual({ cards: [], web: [] });
  expect(collectFindings(undefined as any)).toEqual({ cards: [], web: [] });
});
