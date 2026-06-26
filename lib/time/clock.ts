import { WORD_CAPS } from '@/lib/config';

/** How recent a source must be (in days) to count as "fresh" for today's edition. */
export const FRESHNESS_WINDOW_DAYS = 7;

/**
 * A single, run-wide snapshot of "today". Stamped ONCE per request in orchestrate
 * (and per chat answer) and threaded down so every agent in a run agrees on the date.
 */
export type TodayContext = {
  /** Machine date, e.g. "2026-06-25". Use in queries and freshness math. */
  iso: string;
  /** Human dateLine for the masthead, e.g. "Thursday, June 25, 2026". */
  dateLine: string;
  /** Freshness window in days. */
  windowDays: number;
};

const DATE_LINE_FMT = new Intl.DateTimeFormat('en-US', {
  weekday: 'long', year: 'numeric', month: 'long', day: 'numeric', timeZone: 'UTC',
});

/**
 * Build the run-wide date context. `now` is injectable for tests; defaults to the
 * real wall-clock at call time. Everything downstream reads from this — never from
 * its own `new Date()` — so a run is internally consistent.
 */
export function todayContext(now: Date = new Date()): TodayContext {
  return {
    iso: now.toISOString().slice(0, 10),
    dateLine: DATE_LINE_FMT.format(now),
    windowDays: FRESHNESS_WINDOW_DAYS,
  };
}

/** Shared instruction block injected into every research-facing system prompt. */
export function recencyInstruction(today: TodayContext): string {
  return `Today is ${today.dateLine} (${today.iso}). Report the LATEST available data and ` +
    `strongly prefer sources from the last ${today.windowDays} days. Frame every Tako/web ` +
    `query for current/latest values — include the current year and words like "latest" or ` +
    `"today". Never present old data as if it were current.`;
}

// Re-exported for prompt builders that already import from one place.
export { WORD_CAPS };
