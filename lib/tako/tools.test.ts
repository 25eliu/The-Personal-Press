import { expect, test } from 'vitest';
import { buildTakoTools, collectFindings } from '@/lib/tako/tools';

test('buildTakoTools returns the three named tools', () => {
  const tools = buildTakoTools();
  expect(Object.keys(tools).sort()).toEqual(['tako_answer', 'tako_contents', 'tako_search']);
});

test('collectFindings accumulates cards, web results, and answers from steps', () => {
  const steps = [
    { toolResults: [
      { toolName: 'tako_search', output: {
        cards: [{ title: 'A' }], web_results: [{ title: 'W1', url: 'https://x/1' }],
      } },
    ] },
    { toolResults: [
      { toolName: 'tako_answer', output: {
        answer: 'Rates held steady.', cards: [{ title: 'B' }], web_results: [],
      } },
    ] },
  ] as any;
  const f = collectFindings(steps);
  expect(f.cards.map((c) => c.title)).toEqual(['A', 'B']);
  expect(f.web.map((w) => w.title)).toEqual(['W1']);
  expect(f.answers).toEqual(['Rates held steady.']);
});

test('collectFindings tolerates empty/missing steps', () => {
  expect(collectFindings([] as any)).toEqual({ cards: [], web: [], answers: [] });
  expect(collectFindings(undefined as any)).toEqual({ cards: [], web: [], answers: [] });
});
