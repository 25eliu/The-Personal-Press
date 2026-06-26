import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { getCachedEdition, setCachedEdition } from '@/lib/edition/exampleCache';
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
  expect(getCachedEdition(BRIEF, 1000)).toEqual(PAPER);
});

test('lookup is case/space-insensitive', () => {
  setCachedEdition(BRIEF, PAPER, 1000);
  expect(getCachedEdition('  ai startups, the fed, and the premier league ', 2000)).toEqual(PAPER);
});

test('returns null for a brief that was never cached', () => {
  expect(getCachedEdition('never cached', 1000)).toBeNull();
});

test('expires entries past the TTL', () => {
  setCachedEdition(BRIEF, PAPER, 0);
  expect(getCachedEdition(BRIEF, SIX_HOURS - 1)).toEqual(PAPER);   // still fresh
  expect(getCachedEdition(BRIEF, SIX_HOURS + 1)).toBeNull();        // expired
});
