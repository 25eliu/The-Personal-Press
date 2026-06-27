import { TableData, type TChartSpec, type TTableData } from '@/lib/schema';

const CHART_TYPES: TChartSpec['type'][] = ['line', 'bar', 'area'];

/** Parse a table cell to a number, tolerating $, %, commas, leading + and whitespace. */
export function parseNumeric(cell: string | undefined): number | null {
  if (cell == null) return null;
  const cleaned = cell.replace(/[$,%\s]/g, '').replace(/^\+/, '');
  if (cleaned === '') return null;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}

const colValues = (table: TTableData, col: string): string[] => {
  const i = table.columns.indexOf(col);
  return i < 0 ? [] : table.rows.map((r) => r[i] ?? '');
};

/** A column is numeric if most of its cells parse as numbers. */
function isNumericColumn(table: TTableData, col: string): boolean {
  const vals = colValues(table, col);
  if (vals.length === 0) return false;
  const hits = vals.filter((v) => parseNumeric(v) !== null).length;
  return hits >= Math.max(1, Math.ceil(vals.length * 0.6));
}

/** Years, quarters, ISO-ish dates, or month names dominate → treat as a time axis. */
function looksLikeDates(vals: string[]): boolean {
  if (vals.length === 0) return false;
  const re = /^(\d{4}|Q[1-4]|\d{1,2}[/-]\d{1,2}([/-]\d{2,4})?|\d{4}[/-]\d{1,2}|jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)/i;
  const hits = vals.filter((v) => re.test(v.trim())).length;
  return hits >= Math.ceil(vals.length * 0.6);
}

/** Pick a shared unit ($/%) if most value cells carry one, else none. */
function detectUnit(table: TTableData, valueColumns: string[]): string | undefined {
  const cells = valueColumns.flatMap((c) => colValues(table, c)).filter((v) => v.trim() !== '');
  if (cells.length === 0) return undefined;
  const pct = cells.filter((v) => v.includes('%')).length;
  const usd = cells.filter((v) => v.includes('$')).length;
  if (pct >= Math.ceil(cells.length * 0.6)) return '%';
  if (usd >= Math.ceil(cells.length * 0.6)) return '$';
  return undefined;
}

/**
 * Infer a sensible chart from raw table data when the model named none (or named a bad
 * one). First column is the label/x; numeric columns are the series; a date-like label
 * picks line/area, otherwise bar. Returns undefined when nothing numeric can be charted.
 */
export function inferChartSpec(table: TTableData): TChartSpec | undefined {
  if (!table || table.columns.length < 2 || table.rows.length === 0) return undefined;
  const labelColumn = table.columns[0];
  const valueColumns = table.columns.slice(1).filter((c) => isNumericColumn(table, c));
  if (valueColumns.length === 0) return undefined;
  const dated = looksLikeDates(colValues(table, labelColumn));
  const type: TChartSpec['type'] = dated ? (valueColumns.length === 1 ? 'area' : 'line') : 'bar';
  const unit = detectUnit(table, valueColumns);
  return unit ? { type, labelColumn, valueColumns, unit } : { type, labelColumn, valueColumns };
}

/**
 * Validate/repair a (possibly model-authored) spec against the actual table: drop unknown
 * columns, keep only numeric series, fix an invalid type, and backfill from inference.
 * Returns undefined when the table can't support any chart.
 */
export function validateChartSpec(
  spec: Partial<TChartSpec> | undefined,
  table: TTableData | undefined,
): TChartSpec | undefined {
  if (!table) return undefined;
  const inferred = inferChartSpec(table);
  if (!spec) return inferred;
  const cols = new Set(table.columns);
  const labelColumn = spec.labelColumn && cols.has(spec.labelColumn) ? spec.labelColumn : inferred?.labelColumn;
  if (!labelColumn) return inferred;
  const valueColumns = (spec.valueColumns ?? []).filter(
    (c) => cols.has(c) && c !== labelColumn && isNumericColumn(table, c),
  );
  const series = valueColumns.length > 0 ? valueColumns : inferred?.valueColumns;
  if (!series || series.length === 0) return inferred;
  const type = spec.type && CHART_TYPES.includes(spec.type) ? spec.type : inferred?.type ?? 'bar';
  const unit = spec.unit ?? inferred?.unit;
  return unit ? { type, labelColumn, valueColumns: series, unit } : { type, labelColumn, valueColumns: series };
}

/**
 * Build a chart patch from a model-supplied JSON table string (the data path the copilot's
 * `addChart` action uses to place a graphic on demand). Parses the JSON, validates it against
 * the TableData schema at the boundary, requires a chartable shape (>=2 columns, >=2 rows, a
 * numeric series), then repairs/infers the spec via validateChartSpec. Returns either the
 * ready-to-dispatch { table, chart } patch or a reader-facing { error } explaining the gap.
 */
export function chartPatchFromJson(
  tableJson: string,
  spec: Partial<TChartSpec>,
): { table: TTableData; chart: TChartSpec } | { error: string } {
  let raw: unknown;
  try {
    raw = JSON.parse(tableJson);
  } catch {
    return { error: 'The table must be valid JSON shaped { caption, columns, rows }.' };
  }
  const parsed = TableData.safeParse(raw);
  if (!parsed.success) {
    return { error: 'The table needs { caption, columns: string[], rows: string[][] } with real values.' };
  }
  const table = parsed.data;
  if (table.columns.length < 2 || table.rows.length < 2) {
    return { error: 'A chart needs at least 2 columns and 2+ rows of real data.' };
  }
  const chart = validateChartSpec(spec, table);
  if (!chart) {
    return { error: 'Could not build a chart from that table — at least one column must hold numbers.' };
  }
  return { table, chart };
}

/** Reshape table rows into recharts-ready points: { [labelColumn]: string, [series]: number }. */
export function chartData(table: TTableData, spec: TChartSpec): Record<string, string | number>[] {
  const labelIdx = table.columns.indexOf(spec.labelColumn);
  return table.rows.map((row) => {
    const point: Record<string, string | number> = { [spec.labelColumn]: row[labelIdx] ?? '' };
    for (const c of spec.valueColumns) point[c] = parseNumeric(row[table.columns.indexOf(c)]) ?? 0;
    return point;
  });
}

/** Slice a table's rows by last-N and/or an inclusive from/to window over the label column. */
export function sliceTableRows(
  table: TTableData,
  range: { lastN?: number; from?: string; to?: string },
): TTableData {
  let rows = table.rows;
  if (range.from || range.to) {
    let started = !range.from;
    const next: string[][] = [];
    for (const r of rows) {
      const label = r[0] ?? '';
      if (!started && range.from && label === range.from) started = true;
      if (started) next.push(r);
      if (range.to && label === range.to) break;
    }
    if (next.length > 0) rows = next;
  }
  if (range.lastN && range.lastN > 0 && range.lastN < rows.length) rows = rows.slice(-range.lastN);
  return { ...table, rows };
}

/**
 * Compact, copilot-facing summary of a chart: enough to reason about and answer
 * questions ("what's the peak?") without dumping every row into readable context.
 */
export function summarizeChart(spec: TChartSpec, table: TTableData) {
  const labels = colValues(table, spec.labelColumn);
  const series = spec.valueColumns.map((c) => {
    const nums = colValues(table, c).map(parseNumeric).filter((n): n is number => n !== null);
    return {
      column: c,
      min: nums.length ? Math.min(...nums) : null,
      max: nums.length ? Math.max(...nums) : null,
      latest: nums.length ? nums[nums.length - 1] : null,
    };
  });
  return {
    type: spec.type,
    labelColumn: spec.labelColumn,
    unit: spec.unit,
    rowCount: table.rows.length,
    labelRange: labels.length ? { first: labels[0], last: labels[labels.length - 1] } : null,
    series,
  };
}
