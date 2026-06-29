import { expect, test } from 'vitest';
import { capRows, modalShowsGraphic, MODAL_CHART_W, MODAL_CHART_H } from '@/lib/newspaper/graphicModal';

test('capRows caps to maxRows and reports the hidden remainder', () => {
  expect(capRows([1, 2, 3, 4, 5], 3)).toEqual({ shown: [1, 2, 3], extra: 2 });
});

test('capRows with Infinity shows every row and hides none', () => {
  expect(capRows([1, 2, 3, 4, 5], Infinity)).toEqual({ shown: [1, 2, 3, 4, 5], extra: 0 });
});

test('capRows never reports negative extra when there are fewer rows than the cap', () => {
  expect(capRows([1, 2], 8)).toEqual({ shown: [1, 2], extra: 0 });
});

test('capRows does not mutate its input', () => {
  const rows = [1, 2, 3];
  capRows(rows, 1);
  expect(rows).toEqual([1, 2, 3]);
});

test('modalShowsGraphic is true for visual graph kinds', () => {
  for (const k of ['chart', 'scatter', 'composition'] as const) {
    expect(modalShowsGraphic(k)).toBe(true);
  }
});

test('modalShowsGraphic is false for already-tabular kinds', () => {
  for (const k of ['standings', 'schedule', 'stat'] as const) {
    expect(modalShowsGraphic(k)).toBe(false);
  }
});

test('modal chart size is larger than the column-fit chart', () => {
  expect(MODAL_CHART_W).toBeGreaterThan(260);
  expect(MODAL_CHART_H).toBeGreaterThan(168);
});
