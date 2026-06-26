import { getDailyBriefs, isExampleBrief, PINNED_BRIEF } from '@/lib/edition/examples';

/**
 * Client cache of today's current-event suggested briefs. The server generates them
 * from a live Tako sweep once per day; here we keep the day's set in localStorage so the
 * home screen is instant on return visits and the lineup is stable within a day.
 */
// Bumped to v2 so stale pre-pinned entries are ignored and the new comma format shows.
const KEY = 'tako-daily-briefs-v2';

/** Cap on how many suggestion chips the home screen shows (pinned brief included). */
const MAX_BRIEFS = 4;

type Stored = { date: string; briefs: string[] };

/** Put the always-on pinned brief first, then the dynamic ones (deduped, capped). */
function withPinned(briefs: string[]): string[] {
  const out = [PINNED_BRIEF];
  for (const b of briefs) {
    if (out.some((x) => x.toLowerCase() === b.toLowerCase())) continue;
    out.push(b);
    if (out.length >= MAX_BRIEFS) break;
  }
  return out;
}

/** Today's UTC date stamp — matches the server's todayContext().iso. */
function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

/** Today's stored briefs, or null if absent / from a previous day / malformed. */
export function readStoredBriefs(date: string = todayIso()): string[] | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return null;
    const s = JSON.parse(raw) as Stored;
    return s.date === date && Array.isArray(s.briefs) && s.briefs.length ? s.briefs : null;
  } catch {
    return null;
  }
}

function writeStoredBriefs(briefs: string[], date: string = todayIso()): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(KEY, JSON.stringify({ date, briefs } satisfies Stored));
  } catch {
    /* quota / unavailable — best-effort */
  }
}

/**
 * True when a brief is one of today's suggestions — today's fetched set if we have it,
 * otherwise the static rotation pool. Gates instant-replay caching: only suggested
 * briefs are cached, since a reader's own typed brief should always report fresh.
 */
export function isSuggestedBrief(brief: string): boolean {
  const b = brief.trim().toLowerCase();
  if (b === PINNED_BRIEF.toLowerCase()) return true;
  const stored = readStoredBriefs();
  if (stored?.some((s) => s.toLowerCase() === b)) return true;
  return isExampleBrief(brief);
}

/**
 * Load today's suggested briefs (pinned brief first): localStorage (today) → the live
 * API → the static rotation as a last resort. Always resolves to a non-empty list with
 * the pinned brief included, so the UI never stalls.
 */
export async function loadDailyBriefs(signal?: AbortSignal): Promise<string[]> {
  const cached = readStoredBriefs();
  if (cached) return withPinned(cached);

  try {
    const res = await fetch('/api/suggested-briefs', { signal });
    if (res.ok) {
      const data = (await res.json()) as { briefs?: unknown };
      const briefs = Array.isArray(data.briefs)
        ? data.briefs.filter((x): x is string => typeof x === 'string' && x.trim().length > 0)
        : [];
      if (briefs.length) {
        writeStoredBriefs(briefs);
        return withPinned(briefs);
      }
    }
  } catch {
    /* network / abort — fall through to the static rotation */
  }
  return withPinned(getDailyBriefs());
}
