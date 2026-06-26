/** The suggested briefs offered on the home screen. Shared by the input UI and the
 *  edition cache so "is this an example?" is decided in exactly one place. */
export const EXAMPLE_BRIEFS = [
  'AI startups, the Fed, and the Premier League',
  'crypto markets, SpaceX, and the NBA playoffs',
  'climate policy, oil prices, and the World Cup',
] as const;

/** True when the brief matches one of the suggested examples (case/space-insensitive). */
export function isExampleBrief(brief: string): boolean {
  const b = brief.trim().toLowerCase();
  return EXAMPLE_BRIEFS.some((e) => e.toLowerCase() === b);
}
