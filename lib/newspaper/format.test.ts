import { expect, test } from 'vitest';
import {
  abbr,
  dateAxisFormatter,
  formatCell,
  formatLabel,
  formatNumber,
  formatWhen,
  primarySeries,
  shortLabel,
  withUnit,
} from '@/lib/newspaper/format';
import type { TTableData } from '@/lib/schema';

const t = (columns: string[], rows: string[][], caption = 'x'): TTableData => ({ caption, columns, rows });

// --- Date / time labels ---------------------------------------------------------------

test('formatWhen drops an explicit midnight to a bare day', () => {
  expect(formatWhen('2026-01-07 00:00:00+00:00')).toBe('Jan 7');
  expect(formatWhen('2025-12-31 00:00:00+00:00')).toBe('Dec 31');
});

test('formatWhen keeps a real time', () => {
  expect(formatWhen('2026-06-23 18:05:00+00:00')).toBe('Jun 23 18:05');
});

test('formatWhen passes short / non-ISO values through', () => {
  expect(formatWhen('Sat')).toBe('Sat');
  expect(formatWhen('Q3')).toBe('Q3');
  expect(formatWhen('2024')).toBe('2024');
});

test('dateAxisFormatter shows dates for an all-midnight column', () => {
  const fmt = dateAxisFormatter(['2025-12-31 00:00:00+00:00', '2026-01-07 00:00:00+00:00']);
  expect(fmt('2026-01-07 00:00:00+00:00')).toBe('Jan 7');
  expect(fmt('2025-12-31 00:00:00+00:00')).toBe('Dec 31');
});

test('dateAxisFormatter shows times for an intraday same-day column', () => {
  const fmt = dateAxisFormatter(['2026-01-07 09:30:00+00:00', '2026-01-07 16:00:00+00:00']);
  expect(fmt('2026-01-07 09:30:00+00:00')).toBe('09:30');
  expect(fmt('2026-01-07 16:00:00+00:00')).toBe('16:00');
});

test('dateAxisFormatter is identity for a non-date column', () => {
  const fmt = dateAxisFormatter(['North', 'South', 'West']);
  expect(fmt('North')).toBe('North');
});

test('formatLabel collapses an ISO timestamp but leaves plain labels', () => {
  expect(formatLabel('2026-01-07 00:00:00+00:00')).toBe('Jan 7');
  expect(formatLabel('Argentina')).toBe('Argentina');
});

// --- Numbers --------------------------------------------------------------------------

test('formatNumber groups readable magnitudes and abbreviates huge ones', () => {
  expect(formatNumber(79039.78494623657)).toBe('79,039.78');
  expect(formatNumber(3355.6650246305426)).toBe('3,355.67');
  expect(formatNumber(1721892474)).toBe('1.7B');
  expect(formatNumber(4407076607)).toBe('4.4B');
});

test('formatCell attaches the unit and passes prose through', () => {
  expect(formatCell('3.37', '%')).toBe('3.37%');
  expect(formatCell('1234.5', '$')).toBe('$1,234.5');
  expect(formatCell('Brazil')).toBe('Brazil');
});

test('abbr / withUnit stay compact for axes and callouts', () => {
  expect(abbr(79039.78)).toBe('79.0k');
  expect(withUnit(1721892474, '$')).toBe('$1.7B');
});

// --- Labels ---------------------------------------------------------------------------

test('shortLabel drops a trailing unit parenthetical and duplicate words', () => {
  expect(shortLabel('Nasdaq Current Price Nasdaq (USD)')).toBe('Nasdaq Current Price');
  expect(shortLabel('Closing Price Per Share (USD)', 40)).toBe('Closing Price Per Share');
});

test('shortLabel caps overly long names with an ellipsis', () => {
  const out = shortLabel('Extremely Verbose Column Heading That Runs On');
  expect(out.length).toBeLessThanOrEqual(22);
  expect(out.endsWith('…')).toBe(true);
});

// --- primarySeries: drop incompatible scales ------------------------------------------

test('primarySeries keeps the dominant unit when units differ', () => {
  const table = t(
    ['Date', 'Price', 'Change'],
    [['2026-01-05', '100', '2.1%'], ['2026-01-06', '102', '3.4%'], ['2026-01-07', '101', '1.0%']],
  );
  // Price has no unit, Change is '%' — two unit families, equal counts → keep the first column's family.
  expect(primarySeries(table, ['Price', 'Change'])).toEqual(['Price']);
});

test('primarySeries drops a series >50x smaller than the largest', () => {
  const table = t(
    ['Date', 'Price', 'Pct'],
    [['2026-01-05', '12000', '3'], ['2026-01-06', '12500', '4'], ['2026-01-07', '11800', '2']],
  );
  expect(primarySeries(table, ['Price', 'Pct'])).toEqual(['Price']);
});

test('primarySeries keeps genuinely comparable series', () => {
  const table = t(
    ['Year', 'Imports', 'Exports'],
    [['2022', '40', '38'], ['2023', '44', '41'], ['2024', '47', '45']],
  );
  expect(primarySeries(table, ['Imports', 'Exports'])).toEqual(['Imports', 'Exports']);
});

test('primarySeries leaves a single series untouched', () => {
  const table = t(['Year', 'GDP'], [['2023', '2.5'], ['2024', '2.8']]);
  expect(primarySeries(table, ['GDP'])).toEqual(['GDP']);
});
