import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { getCachedEdition, setCachedEdition, purgeCachedEditionsOnce } from '@/lib/edition/exampleCache';
import type { TNewspaper } from '@/lib/schema';

function makeLocalStorage() {
  const m = new Map<string, string>();
  return {
    getItem: (k: string): string | null => (m.has(k) ? (m.get(k) as string) : null),
    setItem: (k: string, v: string): void => { m.set(k, v); },
    removeItem: (k: string): void => { m.delete(k); },
    clear: (): void => { m.clear(); },
  };
}

const PAPER: TNewspaper = {
  masthead: 'The Personal Press',
  tagline: 't',
  edition: 'e',
  dateLine: 'd',
  pages: [
    { topic: 'Front', articles: [{ kicker: 'K', headline: 'H', byline: 'B', body: 'x', size: 'lead', sources: [{ name: 'S' }] }] },
  ],
};
const BRIEF = 'AI startups, the Fed, and the Premier League';
const SIX_HOURS = 6 * 60 * 60 * 1000;

beforeEach(() => { vi.stubGlobal('window', { localStorage: makeLocalStorage() }); });
afterEach(() => { vi.unstubAllGlobals(); });

test('round-trips a cached edition', () => {
  setCachedEdition(BRIEF, PAPER, 1000);
  expect(getCachedEdition(BRIEF)).toEqual(PAPER);
});

test('lookup is case/space-insensitive', () => {
  setCachedEdition(BRIEF, PAPER, 1000);
  expect(getCachedEdition('  ai startups, the fed, and the premier league ')).toEqual(PAPER);
});

test('returns null for a brief that was never cached', () => {
  expect(getCachedEdition('never cached')).toBeNull();
});

test('is durable — never expires on a timer', () => {
  setCachedEdition(BRIEF, PAPER, 0);
  // Long after the old 6h window, the cached edition is still served (replays with no API).
  setCachedEdition(BRIEF, PAPER, SIX_HOURS * 1000);
  expect(getCachedEdition(BRIEF)).toEqual(PAPER);
});

test('purges cached editions once, then leaves the cache alone', () => {
  setCachedEdition(BRIEF, PAPER, 1000);
  purgeCachedEditionsOnce();                          // first run wipes existing content
  expect(getCachedEdition(BRIEF)).toBeNull();

  setCachedEdition(BRIEF, PAPER, 1000);               // mechanism still works afterward
  purgeCachedEditionsOnce();                          // sentinel set — no-op now
  expect(getCachedEdition(BRIEF)).toEqual(PAPER);
});
