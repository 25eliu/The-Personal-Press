import { expect, test } from 'vitest';
import { csvToTable } from '@/lib/tako/csv-to-table';

test('parses simple csv', () => {
  const t = csvToTable('Date,Rate\n2026-01-01,3.6\n2026-06-23,3.5', 'Fed Funds');
  expect(t).toEqual({
    caption: 'Fed Funds',
    columns: ['Date', 'Rate'],
    rows: [['2026-01-01', '3.6'], ['2026-06-23', '3.5']],
  });
});

test('handles quoted fields with commas', () => {
  const t = csvToTable('Name,Note\n"Powell, J.","held, steady"', 'X');
  expect(t?.rows[0]).toEqual(['Powell, J.', 'held, steady']);
});

test('caps rows', () => {
  const lines = ['A,B', ...Array.from({ length: 10 }, (_, i) => `${i},${i}`)].join('\n');
  expect(csvToTable(lines, 'X', 3)?.rows.length).toBe(3);
});

test('returns undefined for header-only or empty', () => {
  expect(csvToTable('A,B', 'X')).toBeUndefined();
  expect(csvToTable('', 'X')).toBeUndefined();
});
