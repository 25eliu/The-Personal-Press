import { expect, test } from 'vitest';
import { buildTakoTools, collectFindings, csvForCard } from '@/lib/tako/tools';
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

test('collectFindings captures tako_contents CSV (previously discarded)', () => {
  const steps = [
    { toolResults: [
      { toolName: 'tako_contents', output: {
        contents: [{ source_url: 'https://trytako.com/c/abc', format: 'csv', cost: 0, data: 'Year,GDP\n2025,3.1' }],
      } },
    ] },
  ] as any;
  const f = collectFindings(steps);
  expect(f.contents).toHaveLength(1);
  expect(f.contents[0].data).toContain('GDP');
});

test('collectFindings tolerates empty/missing steps', () => {
  expect(collectFindings([] as any)).toEqual({ cards: [], web: [], contents: [] });
  expect(collectFindings(undefined as any)).toEqual({ cards: [], web: [], contents: [] });
});

test('csvForCard matches a card to its CSV by webpage_url and ignores non-CSV', () => {
  const findings = {
    cards: [],
    web: [],
    contents: [
      { source_url: 'https://trytako.com/c/abc', format: 'csv', cost: 0, data: 'Year,GDP\n2025,3.1' },
      { source_url: 'https://trytako.com/c/txt', format: 'text', cost: 0, data: 'prose' },
    ],
  } as any;
  expect(csvForCard({ webpage_url: 'https://trytako.com/c/abc' } as any, findings)).toContain('GDP');
  expect(csvForCard({ webpage_url: 'https://trytako.com/c/txt' } as any, findings)).toBeUndefined();
  expect(csvForCard({ webpage_url: 'https://trytako.com/c/none' } as any, findings)).toBeUndefined();
  expect(csvForCard({} as any, findings)).toBeUndefined();
});
