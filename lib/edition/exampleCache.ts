import type { TNewspaper } from '@/lib/schema';

/**
 * localStorage cache of generated editions for the suggested example briefs, so a
 * second look at an example replays instantly with no API calls. Only example briefs
 * are cached (a real brief always reports fresh news). Entries expire after a short
 * window so a re-shown example doesn't read as stale.
 */
const KEY = 'tako-example-editions';
const TTL_MS = 6 * 60 * 60 * 1000; // 6 hours

// Bump this suffix to force another one-time purge of all cached example editions.
const PURGE_KEY = 'tako-example-editions-purged-v1';

type Entry = { newspaper: TNewspaper; ts: number };
type Store = Record<string, Entry>;

function norm(brief: string): string {
  return brief.trim().toLowerCase();
}

function read(): Store {
  if (typeof window === 'undefined') return {};
  try {
    return JSON.parse(window.localStorage.getItem(KEY) ?? '{}') as Store;
  } catch {
    return {};
  }
}

function write(store: Store): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(KEY, JSON.stringify(store));
  } catch {
    /* quota exceeded or storage unavailable — caching is best-effort */
  }
}

/** A cached edition for this brief, or null if absent/expired. `now` is injectable for tests. */
export function getCachedEdition(brief: string, now: number = Date.now()): TNewspaper | null {
  const entry = read()[norm(brief)];
  if (!entry) return null;
  if (now - entry.ts > TTL_MS) return null;
  return entry.newspaper;
}

/** Store (or refresh) the cached edition for a brief. `now` is injectable for tests. */
export function setCachedEdition(brief: string, newspaper: TNewspaper, now: number = Date.now()): void {
  const store = read();
  store[norm(brief)] = { newspaper, ts: now };
  write(store);
}

/**
 * One-time wipe of all cached example editions. Gated by a sentinel so it runs once per
 * browser: after the first run the sentinel is set and subsequent loads are no-ops, so the
 * cache resumes working normally. Bump PURGE_KEY's suffix to trigger a fresh purge later.
 */
export function purgeCachedEditionsOnce(): void {
  if (typeof window === 'undefined') return;
  try {
    if (window.localStorage.getItem(PURGE_KEY)) return;
    window.localStorage.removeItem(KEY);
    window.localStorage.setItem(PURGE_KEY, '1');
  } catch {
    /* storage unavailable — best-effort */
  }
}
