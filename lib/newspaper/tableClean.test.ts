import { expect, test } from 'vitest';
import { cleanTable, dropConstantColumns, pivotLongFormat } from '@/lib/newspaper/tableClean';
import { pickGraphic } from '@/lib/newspaper/graphic';
import type { TTableData } from '@/lib/schema';

const t = (columns: string[], rows: string[][], caption = 'x'): TTableData => ({ caption, columns, rows });

test('pivotLongFormat turns [X, Series, Value] into a wide multi-series table', () => {
  const long = t(
    ['Quarter', 'Series', 'Value'],
    [['Q1', 'Revenue', '10'], ['Q1', 'Profit', '4'], ['Q2', 'Revenue', '12'], ['Q2', 'Profit', '5']],
  );
  const wide = pivotLongFormat(long)!;
  expect(wide.columns).toEqual(['Quarter', 'Revenue', 'Profit']);
  expect(wide.rows).toEqual([['Q1', '10', '4'], ['Q2', '12', '5']]);
});

test('pivotLongFormat returns undefined for a normal wide table', () => {
  expect(pivotLongFormat(t(['Year', 'GDP'], [['2022', '2'], ['2023', '3']]))).toBeUndefined();
});

test('dropConstantColumns removes a metadata column that repeats one value', () => {
  const melted = t(
    ['#', 'Y Units', 'Close'],
    [['1', 'Percent change', '881'], ['2', 'Percent change', '187'], ['3', 'Percent change', '174']],
  );
  const cleaned = dropConstantColumns(melted);
  expect(cleaned.columns).toEqual(['#', 'Close']);
  expect(cleaned.rows[0]).toEqual(['1', '881']);
});

test('dropConstantColumns keeps at least two columns', () => {
  const allSame = t(['A', 'B'], [['x', 'k'], ['x', 'k']]);
  expect(dropConstantColumns(allSame).columns).toEqual(['A', 'B']);
});

test('cleanTable rescues the melted 30-row series → a chart, not a 30-row standings', () => {
  // The Polymarket/"Y Units" regression: index + constant metadata + two numeric columns.
  const rows = Array.from({ length: 30 }, (_, i) => [`${i + 1}`, 'Percent change', `${900 - i * 10}`, `${6000 + i}`]);
  const melted = t(['#', 'Y Units', 'Close', 'Series'], rows);
  const cleaned = cleanTable(melted);
  expect(cleaned.columns).not.toContain('Y Units'); // noise dropped
  const g = pickGraphic(cleaned)!;
  expect(g.kind).toBe('chart'); // a compact chart, never a clumped standings table
});

test('isStandings still accepts a clean short index table', () => {
  const indices = t(
    ['Index', 'Week', 'Month', 'YTD'],
    [['S&P 500', '0.53%', '0.30%', '8.44%'], ['Dow Jones', '0.69%', '2.93%', '6.56%'], ['Nasdaq', '0.65%', '-0.82%', '1.33%'], ['Russell 2000', '3.95%', '3.61%', '18.67%']],
  );
  const g = pickGraphic(indices)!;
  expect(g.kind).toBe('standings');
});

test('isStandings rejects a long table whose entity repeats one label', () => {
  const rows = Array.from({ length: 8 }, (_, i) => ['Percent change', `${i}`, `${i * 2}`]);
  const melted = t(['Metric', 'A', 'B'], rows); // entity "Metric" = "Percent change" ×8
  const g = pickGraphic(melted);
  // not a standings — entity has 1 distinct value; routes to a chart instead
  expect(g?.kind).not.toBe('standings');
});
