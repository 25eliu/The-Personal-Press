import type { TTableData } from '@/lib/schema';
import { detectColumnUnit, numericValues, parseNumeric } from '@/lib/newspaper/tableShape';

/**
 * Shared newsprint formatting for the graphic components: abbreviate large numbers
 * (1.2k / 3.4M / 1.1B), attach a $/% unit, collapse ISO timestamps to scannable labels,
 * round table figures, and shorten verbose column names. Kept in one place so every
 * graphic reads the same on the page.
 */

/** Compact magnitude for axis ticks / headline figures: 1.2k, 3.4M, 1.1B, else ≤2 decimals. */
export function abbr(n: number): string {
  const a = Math.abs(n);
  if (a >= 1e9) return `${(n / 1e9).toFixed(1)}B`;
  if (a >= 1e6) return `${(n / 1e6).toFixed(1)}M`;
  if (a >= 1e3) return `${(n / 1e3).toFixed(1)}k`;
  return `${Math.round(n * 100) / 100}`;
}

export function withUnit(n: number, unit?: string): string {
  if (unit === '%') return `${abbr(n)}%`;
  if (unit === '$') return `$${abbr(n)}`;
  return abbr(n);
}

/**
 * Table-grade number: keep real precision for readable magnitudes (grouped thousands,
 * ≤2 decimals — "79,039.78", "3,355.67") but abbreviate genuinely huge values ("1.7B",
 * "4.4M"). Tables want the digits; axes/callouts stay compact via withUnit.
 */
export function formatNumber(n: number): string {
  if (Math.abs(n) >= 1e6) return abbr(n);
  return n.toLocaleString('en-US', { maximumFractionDigits: 2 });
}

/** A table cell: format a numeric value (with its $/% unit), else the trimmed raw string. */
export function formatCell(raw: string, unit?: string): string {
  const n = parseNumeric(raw);
  if (n === null) return raw.trim();
  const body = formatNumber(n);
  if (unit === '%') return `${body}%`;
  if (unit === '$') return `$${body}`;
  return body;
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

const ISO = /^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2}))?/;

/** Parsed ISO pieces, or null when the value isn't an ISO date/timestamp. */
function parseIso(raw: string): { month: number; day: number; hh: string; mm: string; hasTime: boolean } | null {
  const m = ISO.exec(raw.trim());
  if (!m) return null;
  return {
    month: Number(m[2]),
    day: Number(m[3]),
    hh: m[4] ?? '',
    mm: m[5] ?? '',
    // A bare date or an explicit midnight reads as a DAY, not a time.
    hasTime: !!m[4] && !(m[4] === '00' && m[5] === '00'),
  };
}

const monthDay = (p: { month: number; day: number }) => `${MONTHS[p.month - 1] ?? p.month} ${p.day}`;

/**
 * Collapse a schedule's "when" cell to a short, scannable label: an ISO date/timestamp
 * ("2026-06-23 18:00:00+00:00") → "Jun 23"; a real time → "Jun 23 18:05"; a bare date or an
 * explicit midnight → "Jan 7" (no 00:00 noise). Already-short values (weekday, clock time,
 * bare year) pass through. Pure string work — no Date, no timezone surprises.
 */
export function formatWhen(raw: string): string {
  const p = parseIso(raw);
  if (!p) return raw.trim();
  return p.hasTime ? `${monthDay(p)} ${p.hh}:${p.mm}` : monthDay(p);
}

/** A single category/axis label: collapse ISO timestamps, pass everything else through. */
export function formatLabel(raw: string | number): string {
  return formatWhen(String(raw));
}

/**
 * Build a tick formatter for one date column that picks ONE sensible granularity for the
 * whole axis: all-midnight → date only ("Jan 7"); intraday within a single day → time only
 * ("14:00"); intraday across days → "Jan 7 14:00". Non-ISO columns format each value as-is.
 */
export function dateAxisFormatter(values: string[]): (raw: string | number) => string {
  const parsed = values.map((v) => parseIso(v));
  const iso = parsed.filter((p): p is NonNullable<typeof p> => p !== null);
  if (iso.length === 0) return (raw) => String(raw);
  const anyTime = iso.some((p) => p.hasTime);
  const sameDay = iso.every((p) => p.month === iso[0].month && p.day === iso[0].day);
  return (raw) => {
    const p = parseIso(String(raw));
    if (!p) return String(raw);
    if (anyTime && sameDay) return `${p.hh}:${p.mm}`;
    if (anyTime) return `${monthDay(p)} ${p.hh}:${p.mm}`;
    return monthDay(p);
  };
}

/**
 * Shorten a verbose column name for display (legend / table header) WITHOUT touching the
 * underlying column key: drop a trailing unit parenthetical ("(USD)"), remove duplicate
 * words ("Nasdaq Current Price Nasdaq" → "Nasdaq Current Price"), and cap with an ellipsis.
 */
export function shortLabel(name: string, max = 22): string {
  let s = name.replace(/\s*\([^)]*\)\s*$/, '').trim();
  const seen = new Set<string>();
  s = s
    .split(/\s+/)
    .filter((w) => {
      const k = w.toLowerCase();
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    })
    .join(' ');
  if (s.length > max) s = `${s.slice(0, max - 1).trimEnd()}…`;
  return s || name.trim();
}

/** The median of the absolute values, or 0 for an empty list. */
function medianAbs(nums: number[]): number {
  const a = nums.map(Math.abs).sort((x, y) => x - y);
  if (a.length === 0) return 0;
  return a[Math.floor(a.length / 2)];
}

/**
 * Choose the PRIMARY group of value columns to plot when a chart mixes incompatible scales
 * (e.g. a price ~100 alongside a %-change ~3) — a single shared Y-axis makes the small
 * series an unreadable flat line. Drops the odd group, keeping a single comparable scale:
 *   - columns whose unit differs from the most common unit are dropped;
 *   - among same-unit columns, any series >50× smaller than the largest is dropped.
 * Comparable series (one unit, similar magnitude) are all kept. Always returns ≥1 column.
 */
export function primarySeries(table: TTableData, valueColumns: string[]): string[] {
  if (valueColumns.length <= 1) return valueColumns;
  const info = valueColumns.map((c) => ({
    c,
    unit: detectColumnUnit(table, c) ?? '',
    mag: medianAbs(numericValues(table, c)),
  }));

  // 1) Resolve to a single unit family (most common; tie → the first column's unit).
  const counts = new Map<string, number>();
  for (const i of info) counts.set(i.unit, (counts.get(i.unit) ?? 0) + 1);
  const maxCount = Math.max(...counts.values());
  const topUnits = [...counts.entries()].filter(([, n]) => n === maxCount).map(([u]) => u);
  const keepUnit = topUnits.includes(info[0].unit) ? info[0].unit : topUnits[0];
  let kept = info.filter((i) => i.unit === keepUnit);

  // 2) Within the unit family, drop magnitude outliers (>50× below the largest series).
  const maxMag = Math.max(...kept.map((i) => i.mag));
  if (maxMag > 0) kept = kept.filter((i) => i.mag === 0 || maxMag / i.mag <= 50);

  const cols = kept.map((i) => i.c);
  return cols.length > 0 ? cols : [valueColumns[0]];
}
