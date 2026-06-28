import { expect, test } from 'vitest';
import {
  chartData,
  chartPatchFromJson,
  inferChartSpec,
  parseNumeric,
  sliceTableRows,
  summarizeChart,
  validateChartSpec,
} from '@/lib/newspaper/chartSpec';
import type { TTableData } from '@/lib/schema';

const timeSeries: TTableData = {
  caption: 'US GDP growth',
  columns: ['Year', 'GDP', 'Inflation'],
  rows: [
    ['2022', '2.1', '8.0'],
    ['2023', '2.5', '4.1'],
    ['2024', '2.8', '3.2'],
    ['2025', '3.1', '2.9'],
  ],
};

const categorical: TTableData = {
  caption: 'Revenue by region',
  columns: ['Region', 'Revenue'],
  rows: [['North', '$4.2'], ['South', '$3.1'], ['West', '$5.0']],
};

test('parseNumeric tolerates currency, percent, commas, leading + and comparators', () => {
  expect(parseNumeric('$1,234.5')).toBe(1234.5);
  expect(parseNumeric('+2%')).toBe(2);
  expect(parseNumeric('<0.01')).toBe(0.01); // odds/probability cells stay numeric
  expect(parseNumeric('~3%')).toBe(3);
  expect(parseNumeric('n/a')).toBeNull();
  expect(parseNumeric(undefined)).toBeNull();
});

test('inferChartSpec picks a time axis (line) for a dated label column', () => {
  const spec = inferChartSpec(timeSeries)!;
  expect(spec.labelColumn).toBe('Year');
  expect(spec.valueColumns).toEqual(['GDP', 'Inflation']);
  expect(spec.type).toBe('line'); // dated + multi-series
});

test('inferChartSpec picks bars for a non-dated category column and detects $ unit', () => {
  const spec = inferChartSpec(categorical)!;
  expect(spec.type).toBe('bar');
  expect(spec.labelColumn).toBe('Region');
  expect(spec.unit).toBe('$');
});

test('inferChartSpec returns undefined when nothing is numeric', () => {
  expect(inferChartSpec({ caption: '', columns: ['A', 'B'], rows: [['x', 'y']] })).toBeUndefined();
});

test('validateChartSpec repairs an unknown column by falling back to inference', () => {
  const spec = validateChartSpec(
    { type: 'bar', labelColumn: 'Nope', valueColumns: ['Bogus'] },
    timeSeries,
  )!;
  expect(spec.labelColumn).toBe('Year');
  expect(spec.valueColumns.length).toBeGreaterThan(0);
});

test('validateChartSpec keeps a valid model spec', () => {
  const spec = validateChartSpec(
    { type: 'area', labelColumn: 'Year', valueColumns: ['GDP'], unit: '%' },
    timeSeries,
  )!;
  expect(spec).toEqual({ type: 'area', labelColumn: 'Year', valueColumns: ['GDP'], unit: '%' });
});

test('chartData shapes rows into label + numeric series', () => {
  const spec = inferChartSpec(timeSeries)!;
  const data = chartData(timeSeries, spec);
  expect(data[0]).toEqual({ Year: '2022', GDP: 2.1, Inflation: 8.0 });
});

test('sliceTableRows supports last-N and a from/to window', () => {
  expect(sliceTableRows(timeSeries, { lastN: 2 }).rows.map((r) => r[0])).toEqual(['2024', '2025']);
  expect(sliceTableRows(timeSeries, { from: '2023', to: '2024' }).rows.map((r) => r[0])).toEqual(['2023', '2024']);
});

test('chartPatchFromJson infers a chart when the spec is omitted', () => {
  const json = JSON.stringify({
    caption: 'World Cup group standings',
    columns: ['Team', 'Points'],
    rows: [['Brazil', '7'], ['France', '6'], ['Japan', '4']],
  });
  const out = chartPatchFromJson(json, {});
  expect('error' in out).toBe(false);
  if ('error' in out) return;
  expect(out.table.rows.length).toBe(3);
  expect(out.chart.type).toBe('bar'); // non-dated category → bars
  expect(out.chart.labelColumn).toBe('Team');
  expect(out.chart.valueColumns).toEqual(['Points']);
});

test('chartPatchFromJson honors an explicit valid spec', () => {
  const json = JSON.stringify({
    caption: 'US GDP growth',
    columns: ['Year', 'GDP', 'Inflation'],
    rows: [['2022', '2.1', '8.0'], ['2023', '2.5', '4.1'], ['2024', '2.8', '3.2']],
  });
  const out = chartPatchFromJson(json, { type: 'line', labelColumn: 'Year', valueColumns: ['GDP'] });
  expect('error' in out).toBe(false);
  if ('error' in out) return;
  expect(out.chart).toEqual({ type: 'line', labelColumn: 'Year', valueColumns: ['GDP'] });
});

test('chartPatchFromJson rejects malformed JSON', () => {
  const out = chartPatchFromJson('{ not json', {});
  expect('error' in out && out.error).toMatch(/valid JSON/);
});

test('chartPatchFromJson rejects a table that fails the schema', () => {
  const out = chartPatchFromJson(JSON.stringify({ caption: 'x', columns: ['A'] }), {});
  expect('error' in out).toBe(true);
});

test('chartPatchFromJson rejects too few rows', () => {
  const json = JSON.stringify({ caption: 'x', columns: ['Team', 'Points'], rows: [['Brazil', '7']] });
  const out = chartPatchFromJson(json, {});
  expect('error' in out && out.error).toMatch(/2\+ rows/);
});

test('chartPatchFromJson rejects a table with no numeric series', () => {
  const json = JSON.stringify({ caption: 'x', columns: ['A', 'B'], rows: [['x', 'y'], ['p', 'q']] });
  const out = chartPatchFromJson(json, {});
  expect('error' in out && out.error).toMatch(/numbers/);
});

test('summarizeChart reports ranges without dumping rows', () => {
  const spec = inferChartSpec(timeSeries)!;
  const s = summarizeChart(spec, timeSeries);
  expect(s.rowCount).toBe(4);
  expect(s.labelRange).toEqual({ first: '2022', last: '2025' });
  const gdp = s.series.find((x) => x.column === 'GDP')!;
  expect(gdp.max).toBe(3.1);
  expect(gdp.latest).toBe(3.1);
});
