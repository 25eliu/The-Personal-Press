import type { TodayContext } from '@/lib/time/clock';

/** Matches a 4-digit 2000s year token anywhere in the text, e.g. "2026". */
const YEAR_TOKEN = /\b20\d{2}\b/;

/**
 * Make a Tako search query time-aware so retrieval favors the current edition's
 * data instead of an evergreen "notable" card. Tako cards carry no date, so the
 * query is the only recency lever — and a bare query like "FIFA" returns the most
 * notable (often years-old) card. If the model already named a year we trust it
 * (it may be intentionally seeking historical data); otherwise we append the
 * current year. Pure and idempotent — re-running on its own output is a no-op.
 */
export function timeAwareQuery(query: string, today: TodayContext): string {
  const trimmed = query.trim();
  if (!trimmed || YEAR_TOKEN.test(trimmed)) return trimmed;
  const year = today.iso.slice(0, 4);
  return `${trimmed} ${year}`;
}
