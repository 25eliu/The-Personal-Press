/** A guaranteed suggested brief, always shown first on the home screen. */
export const PINNED_BRIEF = 'fifa, developer news, stocks';

/** Curated pool of suggested briefs. Three are surfaced on the home screen each day
 *  (see getDailyBriefs), rotating deterministically so the lineup feels fresh without
 *  ever losing the instant-replay cache — any pooled brief still counts as an example.
 *  Each brief is several topics separated by commas. */
export const EXAMPLE_POOL = [
  PINNED_BRIEF,
  'AI startups, the Fed, the Premier League',
  'crypto markets, SpaceX, the NBA playoffs',
  'climate policy, oil prices, the World Cup',
  'chip wars, interest rates, Formula 1',
  'housing markets, OpenAI, the Champions League',
  'gold, the dollar, Grand Slam tennis',
  'electric vehicles, inflation, the Summer Olympics',
  'biotech breakthroughs, Tesla, college football',
  'commercial space, bond yields, the Tour de France',
  'semiconductors, the jobs report, the Ryder Cup',
  'AI regulation, emerging markets, the Cricket World Cup',
  'renewable energy, the yen, the MLB pennant race',
] as const;

/** Back-compat alias for membership checks; prefer getDailyBriefs() for what to show. */
export const EXAMPLE_BRIEFS = EXAMPLE_POOL;

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
