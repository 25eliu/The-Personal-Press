import type { TTableData } from '@/lib/schema';
import { colValues, distinctCount, isNumericColumn, looksLikeDates } from '@/lib/newspaper/tableShape';

/**
 * Normalize a raw Tako (or model) table BEFORE it reaches the graphic router, so the router
 * sees clean, wide data instead of melted/noisy CSV. Two passes:
 *   1. pivotLongFormat — a long/"melted" table ([X, value, Series]) → wide ([X, s1, s2, …]),
 *      the shape a clean multi-series chart wants.
 *   2. dropConstantColumns — strip columns that carry no signal (a metadata column repeating
 *      one value, e.g. "Y Units" = "Percent change" on every row), which otherwise derails the
 *      detectors into a junk standings/table.
 * Pure: always returns a new table. Run ONCE at ingestion so the stored table and its graphic
 * agree on columns.
 */

const colIndex = (table: TTableData, col: string) => table.columns.indexOf(col);

/** Drop columns whose cells are all the same value (no signal), keeping at least 2 columns. */
export function dropConstantColumns(table: TTableData): TTableData {
  if (table.columns.length <= 2 || table.rows.length < 2) return table;
  const keep = table.columns.filter((c) => distinctCount(table, c) > 1);
  if (keep.length === table.columns.length || keep.length < 2) return table; // nothing to drop / would over-strip
  const idxs = keep.map((c) => colIndex(table, c));
  return {
    caption: table.caption,
    columns: keep,
    rows: table.rows.map((r) => idxs.map((i) => r[i] ?? '')),
  };
}

/**
 * Pivot a long/"melted" table to wide when the shape clearly matches: a categorical SERIES
 * column (text, 2–8 distinct values that repeat), a numeric VALUE column, and an X/label column,
 * with roughly one row per (X × series) pair. Returns the wide table ([X, series₁, …]) or
 * undefined when it isn't a long table (so callers fall back to the original).
 */
export function pivotLongFormat(table: TTableData): TTableData | undefined {
  if (table.columns.length < 3 || table.rows.length < 4) return undefined;

  const numeric = table.columns.filter((c) => isNumericColumn(table, c));
  const text = table.columns.filter((c) => !isNumericColumn(table, c));
  if (numeric.length < 1 || text.length < 1) return undefined;

  // SERIES: a text column with a small, repeating set of labels — preferring a NON-date column
  // so a date/quarter text column becomes the X axis, not the series key.
  const candidates = text.filter((c) => {
    const d = distinctCount(table, c);
    return d >= 2 && d <= 8 && d < table.rows.length;
  });
  if (candidates.length === 0) return undefined;
  const seriesCol = candidates.find((c) => !looksLikeDates(colValues(table, c))) ?? candidates[0];

  // VALUE: a numeric column to spread across the series.
  const valueCol = numeric[0];
  // X: any other column (the axis the series share).
  const xCol = table.columns.find((c) => c !== seriesCol && c !== valueCol);
  if (!xCol) return undefined;

  const seriesVals = [...new Set(colValues(table, seriesCol).map((v) => v.trim()))].filter(Boolean);
  const xVals = [...new Set(colValues(table, xCol).map((v) => v.trim()))].filter(Boolean);
  // Long shape sanity: rows should be ~ one per (X × series) pair.
  if (xVals.length < 2 || seriesVals.length < 2) return undefined;
  if (table.rows.length < xVals.length || table.rows.length > xVals.length * seriesVals.length + 1) return undefined;

  const xi = colIndex(table, xCol);
  const si = colIndex(table, seriesCol);
  const vi = colIndex(table, valueCol);
  // value[x][series]
  const grid = new Map<string, Map<string, string>>();
  for (const r of table.rows) {
    const x = (r[xi] ?? '').trim();
    const s = (r[si] ?? '').trim();
    if (!x || !s) continue;
    if (!grid.has(x)) grid.set(x, new Map());
    grid.get(x)!.set(s, r[vi] ?? '');
  }

  const rows = xVals.map((x) => [x, ...seriesVals.map((s) => grid.get(x)?.get(s) ?? '')]);
  return { caption: table.caption, columns: [xCol, ...seriesVals], rows };
}

/** Clean a table for routing: pivot a long format if present, then drop constant columns. */
export function cleanTable(table: TTableData): TTableData {
  return dropConstantColumns(pivotLongFormat(table) ?? table);
}
