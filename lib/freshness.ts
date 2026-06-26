import type { TodayContext } from '@/lib/time/clock';

/**
 * Freshness math over a source's publish date. The only hard signal we have is
 * `TakoWebResult.publish_date`; Tako cards are undated (live datasets) and treated
 * as current. An undated source is NEVER auto-rejected — it ranks below dated-fresh
 * and above dated-stale.
 */

/** Whole days between `date` and today's iso. `null` when missing/unparseable. */
export function daysAgo(date: string | null | undefined, today: TodayContext): number | null {
  if (!date) return null;
  const then = Date.parse(date);
  if (Number.isNaN(then)) return null;
  const now = Date.parse(`${today.iso}T00:00:00Z`);
  return Math.floor((now - then) / 86_400_000);
}

/** A dated source older than the window is stale. Undated → not stale (neutral). */
export function isStale(date: string | null | undefined, today: TodayContext): boolean {
  const d = daysAgo(date, today);
  return d !== null && d > today.windowDays;
}

/**
 * Ranking key, higher = fresher. Dated-fresh (window..0) scores highest by recency;
 * undated is neutral; dated-stale scores lowest, least-stale first.
 */
export function freshnessScore(date: string | null | undefined, today: TodayContext): number {
  const d = daysAgo(date, today);
  if (d === null) return 0;          // undated: neutral
  if (d <= today.windowDays) return 1000 - d;   // fresh: most-recent first
  return -d;                          // stale: least-stale first, always < neutral
}

/** Human "as of" stamp for an older-but-best-available story. Undefined when fresh/undated. */
export function freshnessLabel(date: string | null | undefined, today: TodayContext): string | undefined {
  if (!date || !isStale(date, today)) return undefined;
  const t = Date.parse(date);
  if (Number.isNaN(t)) return undefined;
  const fmt = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' });
  return `as of ${fmt.format(new Date(t))}`;
}

/** Most-recent of a set of dates as an iso string, or undefined if none are dated. */
export function newestDate(dates: (string | null | undefined)[], today: TodayContext): string | undefined {
  let best: { iso: string; d: number } | undefined;
  for (const date of dates) {
    const d = daysAgo(date, today);
    if (d === null || !date) continue;
    if (!best || d < best.d) best = { iso: date, d };
  }
  return best?.iso;
}
