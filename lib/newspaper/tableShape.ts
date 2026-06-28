import type { TTableData } from '@/lib/schema';

/**
 * Shared column-shape detectors for a TableData. These are the primitives the chart
 * inference (chartSpec.ts) and the graphic router (graphic.ts) both reason with, so they
 * live in one place: parse a cell to a number, read a column, and judge whether a column
 * is numeric / date-like / unit-bearing. Pure and string-only — no schema knowledge.
 */

/**
 * Parse a table cell to a number, tolerating $, %, commas, whitespace, a leading +, and a
 * leading comparator (<, >, ~, ≈) — so probability/odds cells like "<0.01", "~3%", ">1M"
 * still read as the numeric series they are (and don't get mistaken for text labels).
 */
export function parseNumeric(cell: string | undefined): number | null {
  if (cell == null) return null;
  const cleaned = cell.replace(/[$,%\s]/g, '').replace(/^[+<>~≈]+/, '');
  if (cleaned === '') return null;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}

/** The cells of one named column, '' for missing. Empty array when the column is unknown. */
export function colValues(table: TTableData, col: string): string[] {
  const i = table.columns.indexOf(col);
  return i < 0 ? [] : table.rows.map((r) => r[i] ?? '');
}

/** A column is numeric if most (≥60%) of its non-empty cells parse as numbers. */
export function isNumericColumn(table: TTableData, col: string): boolean {
  const vals = colValues(table, col);
  if (vals.length === 0) return false;
  const hits = vals.filter((v) => parseNumeric(v) !== null).length;
  return hits >= Math.max(1, Math.ceil(vals.length * 0.6));
}

/** Years, quarters, ISO-ish dates, or month names dominate → treat as a time axis. */
export function looksLikeDates(vals: string[]): boolean {
  if (vals.length === 0) return false;
  const re = /^(\d{4}|Q[1-4]|\d{1,2}[/-]\d{1,2}([/-]\d{2,4})?|\d{4}[/-]\d{1,2}|jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)/i;
  const hits = vals.filter((v) => re.test(v.trim())).length;
  return hits >= Math.ceil(vals.length * 0.6);
}

/** Date/time-ish enough to anchor a SCHEDULE: a date, a clock time (15:00), or a weekday. */
export function looksLikeWhen(vals: string[]): boolean {
  if (vals.length === 0) return false;
  if (looksLikeDates(vals)) return true;
  const when = /^(\d{1,2}:\d{2}(\s*(am|pm))?|mon|tue|wed|thu|fri|sat|sun)/i;
  const hits = vals.filter((v) => when.test(v.trim())).length;
  return hits >= Math.ceil(vals.length * 0.6);
}

/** Pick a shared unit ($/%) if most cells across the value columns carry one, else none. */
export function detectUnit(table: TTableData, valueColumns: string[]): string | undefined {
  const cells = valueColumns.flatMap((c) => colValues(table, c)).filter((v) => v.trim() !== '');
  if (cells.length === 0) return undefined;
  const pct = cells.filter((v) => v.includes('%')).length;
  const usd = cells.filter((v) => v.includes('$')).length;
  if (pct >= Math.ceil(cells.length * 0.6)) return '%';
  if (usd >= Math.ceil(cells.length * 0.6)) return '$';
  return undefined;
}

/**
 * The unit ($/%) that ONE column's own cells carry — never borrowed from a sibling column.
 * Used where each figure is formatted on its own (a stat tile, a standings stat) so a count
 * column isn't mislabelled with a neighbour's "$"/"%".
 */
export function detectColumnUnit(table: TTableData, col: string): string | undefined {
  return detectUnit(table, [col]);
}

/** Number of distinct (trimmed) values in a column — a repeated-value column isn't a real list. */
export function distinctCount(table: TTableData, col: string): number {
  return new Set(colValues(table, col).map((v) => v.trim()).filter((v) => v !== '')).size;
}

/**
 * A prose/free-text column: cells read like sentences or questions rather than labels —
 * long on average, or carrying a "?". Specialized graphics (schedule/standings/stat) should
 * NOT key off such a column; the article falls back to a plain table instead.
 */
export function isProseColumn(table: TTableData, col: string): boolean {
  const vals = colValues(table, col).filter((v) => v.trim() !== '');
  if (vals.length === 0) return false;
  if (vals.some((v) => v.includes('?'))) return true;
  const lengths = vals.map((v) => v.trim().length).sort((a, b) => a - b);
  const median = lengths[Math.floor(lengths.length / 2)];
  return median > 32;
}

/** Numbers parsed from one column, dropping cells that aren't numeric. */
export function numericValues(table: TTableData, col: string): number[] {
  return colValues(table, col)
    .map(parseNumeric)
    .filter((n): n is number => n !== null);
}
