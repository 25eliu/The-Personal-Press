/** A guaranteed suggested brief, always shown first on the home screen. */
export const PINNED_BRIEF = 'world news, business, technology';

/** Curated pool of suggested briefs. Three are surfaced on the home screen each day
 *  (see getDailyBriefs), rotating deterministically so the lineup feels fresh without
 *  ever losing the instant-replay cache — any pooled brief still counts as an example.
 *  Each brief is several BROAD news beats separated by commas (not specific entities), so
 *  Tako always has data to chart and every section reads as a real newspaper desk. */
export const EXAMPLE_POOL = [
  PINNED_BRIEF,
  'world news, business, sports',
  'technology, markets, science',
  'politics, health, culture',
  'the economy, climate, global sport',
  'finance, world affairs, entertainment',
  'energy, geopolitics, space',
  'markets, technology, sports',
  'business, science, world news',
] as const;

/** Back-compat alias for membership checks; prefer getDailyBriefs() for what to show. */
export const EXAMPLE_BRIEFS = EXAMPLE_POOL;

/**
 * The fixed home-screen lineup — the SAME prompts on every visit (pinned brief first), with no
 * daily rotation or live wire. A stable lineup is what lets each example's generated edition stay
 * cached and replay instantly on a later run (the cache is keyed by the brief text).
 */
export const HOME_BRIEFS: readonly string[] = EXAMPLE_POOL.slice(0, 4);

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Today's suggested briefs, rotated by calendar day (UTC). The set changes daily but is
 * stable within a day and identical on server + client (epoch-derived, timezone-free),
 * so it rotates without risking a hydration mismatch.
 */
export function getDailyBriefs(now: number = Date.now(), count = 3): string[] {
  const day = Math.floor(now / DAY_MS);
  const start = ((day * count) % EXAMPLE_POOL.length + EXAMPLE_POOL.length) % EXAMPLE_POOL.length;
  return Array.from({ length: count }, (_, i) => EXAMPLE_POOL[(start + i) % EXAMPLE_POOL.length]);
}

/** True when the brief matches one of the suggested examples (case/space-insensitive). */
export function isExampleBrief(brief: string): boolean {
  const b = brief.trim().toLowerCase();
  return EXAMPLE_POOL.some((e) => e.toLowerCase() === b);
}
