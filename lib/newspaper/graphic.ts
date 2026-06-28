import { TableData, type TChartSpec, type TGraphic, type TGraphicKind, type TTableData } from '@/lib/schema';
import { validateChartSpec } from '@/lib/newspaper/chartSpec';
import { cleanTable } from '@/lib/newspaper/tableClean';
import {
  colValues,
  detectUnit,
  distinctCount,
  isNumericColumn,
  isProseColumn,
  looksLikeDates,
  looksLikeWhen,
  numericValues,
} from '@/lib/newspaper/tableShape';

// A leaderboard is a short list of DISTINCT entities — not a 30-row melted series.
const STANDINGS_MAX_ROWS = 20;
// A schedule is a short event list — a long date-indexed run is a time series (→ chart).
const SCHEDULE_MAX_ROWS = 12;

/**
 * The graphic router. ONE data path (the article's `table`), many renderings: this module
 * decides WHICH premade graphic best fits a table's shape (pickGraphic), builds a specific
 * kind on demand (buildGraphic, for the copilot's explicit `kind`), repairs a possibly-bad
 * spec against the real columns (validateGraphic), and summarizes a graphic for the copilot
 * (summarizeGraphic). Every spec it returns references only columns that exist in the table.
 *
 * Auto-routing runs the specialized kinds FIRST (stat, schedule, composition, standings,
 * scatter) and falls back to the line/bar/area chart — so the model's chart hint only ever
 * shapes the chart fallback, never blocks a richer kind the data clearly calls for.
 */

/** A loose bag of per-kind column hints (the copilot's optional overrides + the model's chart hint). */
export type GraphicHint = {
  type?: TChartSpec['type'];
  labelColumn?: string;
  valueColumns?: string[];
  valueColumn?: string;
  xColumn?: string;
  yColumn?: string;
  entityColumn?: string;
  statColumns?: string[];
  rankColumn?: string;
  movementColumn?: string;
  whenColumn?: string;
  titleColumn?: string;
  detailColumn?: string;
  statusColumn?: string;
  deltaColumn?: string;
  unit?: string;
};

const has = (table: TTableData, col: string | undefined): col is string =>
  col != null && table.columns.includes(col);

const numericColumns = (table: TTableData): string[] =>
  table.columns.filter((c) => isNumericColumn(table, c));

const textColumns = (table: TTableData): string[] =>
  table.columns.filter((c) => !isNumericColumn(table, c));

const isDateLike = (table: TTableData, col: string | undefined): boolean =>
  col != null && looksLikeDates(colValues(table, col));

/** A numeric column that runs 1,2,3,… in row order, or is named like a rank/position. */
function detectRankColumn(table: TTableData): string | undefined {
  const byName = table.columns.find(
    (c) => /^(rank|pos|position|place|#|no\.?)$/i.test(c.trim()) && isNumericColumn(table, c),
  );
  if (byName) return byName;
  for (const c of numericColumns(table)) {
    const vals = numericValues(table, c);
    if (vals.length === table.rows.length && vals.every((v, i) => v === i + 1)) return c;
  }
  return undefined;
}

// --- Explicit construction: build ONE specific kind, auto-picking columns + honoring hints --

function buildChart(table: TTableData, hint: GraphicHint): TGraphic | undefined {
  const spec = validateChartSpec(
    { type: hint.type, labelColumn: hint.labelColumn, valueColumns: hint.valueColumns, unit: hint.unit },
    table,
  );
  return spec ? { kind: 'chart', ...spec } : undefined;
}

function buildScatter(table: TTableData, hint: GraphicHint): TGraphic | undefined {
  const nums = numericColumns(table);
  const xColumn = has(table, hint.xColumn) && isNumericColumn(table, hint.xColumn) ? hint.xColumn : nums[0];
  const yColumn =
    has(table, hint.yColumn) && isNumericColumn(table, hint.yColumn) && hint.yColumn !== xColumn
      ? hint.yColumn
      : nums.find((c) => c !== xColumn);
  if (!xColumn || !yColumn) return undefined;
  const labelColumn = has(table, hint.labelColumn) ? hint.labelColumn : textColumns(table)[0];
  const unit = hint.unit ?? detectUnit(table, [xColumn, yColumn]);
  return { kind: 'scatter', xColumn, yColumn, ...(labelColumn ? { labelColumn } : {}), ...(unit ? { unit } : {}) };
}

function buildComposition(table: TTableData, hint: GraphicHint): TGraphic | undefined {
  const labelColumn = has(table, hint.labelColumn) ? hint.labelColumn : textColumns(table)[0] ?? table.columns[0];
  const nums = numericColumns(table).filter((c) => c !== labelColumn);
  const valueColumn = has(table, hint.valueColumn) && isNumericColumn(table, hint.valueColumn) ? hint.valueColumn : nums[0];
  if (!labelColumn || !valueColumn) return undefined;
  const unit = hint.unit ?? detectUnit(table, [valueColumn]);
  return { kind: 'composition', labelColumn, valueColumn, ...(unit ? { unit } : {}) };
}

function buildStandings(table: TTableData, hint: GraphicHint): TGraphic | undefined {
  const entityColumn = has(table, hint.entityColumn) ? hint.entityColumn : textColumns(table)[0] ?? table.columns[0];
  if (!entityColumn) return undefined;
  const rankColumn = has(table, hint.rankColumn) ? hint.rankColumn : detectRankColumn(table);
  const wanted = (hint.statColumns ?? []).filter((c) => has(table, c) && isNumericColumn(table, c));
  const auto = numericColumns(table).filter((c) => c !== rankColumn && c !== entityColumn);
  const statColumns = wanted.length > 0 ? wanted : auto;
  if (statColumns.length === 0) return undefined;
  const movementColumn = has(table, hint.movementColumn) ? hint.movementColumn : undefined;
  return {
    kind: 'standings',
    entityColumn,
    statColumns,
    ...(rankColumn ? { rankColumn } : {}),
    ...(movementColumn ? { movementColumn } : {}),
  };
}

function buildStat(table: TTableData, hint: GraphicHint): TGraphic | undefined {
  const labelColumn = has(table, hint.labelColumn) ? hint.labelColumn : table.columns[0];
  if (!labelColumn) return undefined;
  const wanted = (hint.valueColumns ?? []).filter((c) => has(table, c) && isNumericColumn(table, c));
  const auto = numericColumns(table).filter((c) => c !== labelColumn);
  const valueColumns = wanted.length > 0 ? wanted : auto.length > 0 ? auto : numericColumns(table);
  if (valueColumns.length === 0) return undefined;
  const deltaColumn = has(table, hint.deltaColumn) ? hint.deltaColumn : undefined;
  // Only an EXPLICIT unit here — tiles otherwise format each column on its own (a count
  // column must not borrow a money column's "$"). StatCallout derives per-column units.
  const unit = hint.unit;
  return {
    kind: 'stat',
    labelColumn,
    valueColumns,
    ...(unit ? { unit } : {}),
    ...(deltaColumn ? { deltaColumn } : {}),
  };
}

function buildSchedule(table: TTableData, hint: GraphicHint): TGraphic | undefined {
  // A schedule's whole premise is a time axis: only honor an explicit hint or a column that
  // actually reads as dates/times. NO columns[0] fallback — fabricating a "schedule" from,
  // say, team names produced a junk graphic that the action then reported as success.
  const whenColumn = has(table, hint.whenColumn)
    ? hint.whenColumn
    : table.columns.find((c) => looksLikeWhen(colValues(table, c)));
  const titleColumn = has(table, hint.titleColumn)
    ? hint.titleColumn
    : table.columns.find((c) => c !== whenColumn);
  if (!whenColumn || !titleColumn) return undefined;
  const rest = table.columns.filter((c) => c !== whenColumn && c !== titleColumn);
  const detailColumn = has(table, hint.detailColumn) ? hint.detailColumn : rest[0];
  const statusColumn = has(table, hint.statusColumn) ? hint.statusColumn : rest.find((c) => c !== detailColumn);
  return {
    kind: 'schedule',
    whenColumn,
    titleColumn,
    ...(detailColumn ? { detailColumn } : {}),
    ...(statusColumn ? { statusColumn } : {}),
  };
}

/** Build a specific graphic kind from a table, auto-selecting columns and honoring hints. */
export function buildGraphic(kind: TGraphicKind, table: TTableData, hint: GraphicHint = {}): TGraphic | undefined {
  switch (kind) {
    case 'chart':
      return buildChart(table, hint);
    case 'scatter':
      return buildScatter(table, hint);
    case 'composition':
      return buildComposition(table, hint);
    case 'standings':
      return buildStandings(table, hint);
    case 'stat':
      return buildStat(table, hint);
    case 'schedule':
      return buildSchedule(table, hint);
    default:
      return undefined;
  }
}

// --- Auto-routing: pick the kind that best fits the table's shape -----------------------

function isStat(table: TTableData): boolean {
  // A single fact / row of KPIs — but not a lone row of prose (a headline, a question).
  return table.rows.length === 1 && table.columns.length >= 1 && !isProseColumn(table, table.columns[0]);
}

function isSchedule(table: TTableData): boolean {
  // A schedule is a SHORT event list with no chartable numbers. A long date-indexed run
  // (e.g. a daily probability series) is a time series and must route to a chart instead.
  if (
    numericColumns(table).length !== 0 ||
    table.columns.length < 2 ||
    table.rows.length < 2 ||
    table.rows.length > SCHEDULE_MAX_ROWS
  ) {
    return false;
  }
  const whenColumn = table.columns.find((c) => looksLikeWhen(colValues(table, c)));
  if (!whenColumn) return false;
  const titleColumn = table.columns.find((c) => c !== whenColumn);
  // A real schedule: short event titles (not questions/prose) that actually vary row to row.
  return !!titleColumn && !isProseColumn(table, titleColumn) && distinctCount(table, titleColumn) >= 2;
}

function isComposition(table: TTableData): boolean {
  const nums = numericColumns(table);
  const label = textColumns(table)[0];
  if (nums.length !== 1 || !label || isDateLike(table, label) || isProseColumn(table, label)) return false;
  if (table.rows.length < 2 || table.rows.length > 12) return false;
  const vals = numericValues(table, nums[0]);
  if (vals.length === 0) return false;
  if (detectUnit(table, nums) === '%') return true;
  const sum = vals.reduce((a, b) => a + b, 0);
  return sum >= 90 && sum <= 110; // values that read as parts of ~100%
}

function isStandings(table: TTableData): boolean {
  const entity = textColumns(table)[0];
  // A leaderboard needs real entity NAMES (not questions/sentences), not a time axis, and a
  // sane length (3..20 rows).
  if (
    !entity ||
    isDateLike(table, table.columns[0]) ||
    isProseColumn(table, entity) ||
    table.rows.length < 3 ||
    table.rows.length > STANDINGS_MAX_ROWS
  ) {
    return false;
  }
  // Entities must actually VARY — a column repeating one label (a melted "Y Units" = "Percent
  // change" ×30) is a series, not a leaderboard.
  if (distinctCount(table, entity) < Math.max(3, Math.ceil(table.rows.length * 0.6))) return false;
  return detectRankColumn(table) !== undefined || numericColumns(table).length >= 2;
}

function isScatter(table: TTableData): boolean {
  return table.columns.length === 2 && numericColumns(table).length === 2 && table.rows.length >= 4;
}

/**
 * Choose the graphic that best fits a table. The model's chart hint (line/bar/area + columns)
 * only shapes the chart fallback. Returns undefined when nothing can be drawn (e.g. a table
 * with no numbers and no date column — exactly when there was no chart before).
 */
export function pickGraphic(table: TTableData | undefined, hint: GraphicHint = {}): TGraphic | undefined {
  if (!table || table.columns.length < 1 || table.rows.length < 1) return undefined;
  if (isStat(table)) return buildStat(table, hint);
  if (isSchedule(table)) return buildSchedule(table, hint);
  if (isComposition(table)) return buildComposition(table, hint);
  if (isStandings(table)) return buildStandings(table, hint);
  if (isScatter(table)) return buildScatter(table, hint);
  // Chart fallback — but if ANY column is prose (questions/sentences, e.g. prediction-market
  // rows), the table is messy: a chart would silently ignore the real subject and plot a
  // degenerate axis. Return nothing so the article shows its clean DataTable instead.
  if (table.columns.some((c) => isProseColumn(table, c))) return undefined;
  return buildChart(table, hint);
}

/** Pull a hint back out of an existing graphic so it can be re-built/repaired against a table. */
function hintFromGraphic(g: TGraphic): GraphicHint {
  switch (g.kind) {
    case 'chart':
      return { type: g.type, labelColumn: g.labelColumn, valueColumns: g.valueColumns, unit: g.unit };
    case 'scatter':
      return { xColumn: g.xColumn, yColumn: g.yColumn, labelColumn: g.labelColumn, unit: g.unit };
    case 'composition':
      return { labelColumn: g.labelColumn, valueColumn: g.valueColumn, unit: g.unit };
    case 'standings':
      return { entityColumn: g.entityColumn, statColumns: g.statColumns, rankColumn: g.rankColumn, movementColumn: g.movementColumn };
    case 'stat':
      return { labelColumn: g.labelColumn, valueColumns: g.valueColumns, unit: g.unit, deltaColumn: g.deltaColumn };
    case 'schedule':
      return { whenColumn: g.whenColumn, titleColumn: g.titleColumn, detailColumn: g.detailColumn, statusColumn: g.statusColumn };
  }
}

/**
 * Repair a (possibly model/agent-authored) graphic against the actual table: keep its kind
 * but drop unknown columns and re-select sensible ones; if the kind can't be built at all,
 * fall back to auto-routing. Returns undefined only when the table supports no graphic.
 */
export function validateGraphic(spec: TGraphic | undefined, table: TTableData | undefined): TGraphic | undefined {
  if (!table) return undefined;
  if (!spec) return pickGraphic(table);
  return buildGraphic(spec.kind, table, hintFromGraphic(spec)) ?? pickGraphic(table);
}

/**
 * Build a graphic patch from a model/agent-supplied JSON table string — the on-demand path
 * the copilot's addChart action uses. Validates the table at the boundary, then routes (or
 * builds the requested `kind`). Returns the ready { table, graphic } patch or a { error }.
 */
export function graphicPatchFromJson(
  tableJson: string,
  kind?: TGraphicKind,
  hint: GraphicHint = {},
): { table: TTableData; graphic?: TGraphic } | { error: string } {
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
  // Normalize melted/noisy data before routing so the stored table and graphic agree on columns.
  const table = cleanTable(parsed.data);
  if (table.columns.length < 1 || table.rows.length < 1) {
    return { error: 'A graphic needs at least one column and one row of real data.' };
  }
  // A FORCED kind that can't be built is an error the caller should hear. With no kind, fall
  // back to a table-only patch (graphic undefined) so messy data still lands cleanly.
  if (kind) {
    const graphic = buildGraphic(kind, table, hint);
    if (!graphic) {
      return { error: `Could not build a ${kind} from that table — check the columns and that any series hold numbers.` };
    }
    return { table, graphic };
  }
  return { table, graphic: pickGraphic(table, hint) };
}

/** The label/category column a graphic reads its row labels from. */
function primaryLabel(g: TGraphic): string {
  switch (g.kind) {
    case 'chart':
      return g.labelColumn;
    case 'scatter':
      return g.labelColumn ?? g.xColumn;
    case 'composition':
      return g.labelColumn;
    case 'standings':
      return g.entityColumn;
    case 'stat':
      return g.labelColumn;
    case 'schedule':
      return g.whenColumn;
  }
}

/** The numeric columns a graphic plots (empty for a schedule). */
function valueColumnsOf(g: TGraphic): string[] {
  switch (g.kind) {
    case 'chart':
      return g.valueColumns;
    case 'scatter':
      return [g.xColumn, g.yColumn];
    case 'composition':
      return [g.valueColumn];
    case 'standings':
      return g.statColumns;
    case 'stat':
      return g.valueColumns;
    case 'schedule':
      return [];
  }
}

/**
 * Compact, copilot-facing summary of a graphic: its kind, the columns it reads, value ranges
 * (not raw rows), and the label span — enough to reason about and reshape without dumping the
 * whole table into readable context.
 */
export function summarizeGraphic(g: TGraphic, table: TTableData) {
  const labelCol = primaryLabel(g);
  const labels = colValues(table, labelCol);
  const series = valueColumnsOf(g).map((c) => {
    const nums = numericValues(table, c);
    return {
      column: c,
      min: nums.length ? Math.min(...nums) : null,
      max: nums.length ? Math.max(...nums) : null,
      latest: nums.length ? nums[nums.length - 1] : null,
    };
  });
  return {
    kind: g.kind,
    unit: 'unit' in g ? g.unit : undefined,
    rowCount: table.rows.length,
    labelColumn: labelCol,
    labelRange: labels.length ? { first: labels[0], last: labels[labels.length - 1] } : null,
    series,
  };
}
