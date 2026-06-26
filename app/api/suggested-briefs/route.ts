import { generateSuggestedBriefs } from '@/lib/agents/suggestions';
import { todayContext } from '@/lib/time/clock';
import { logCall } from '@/lib/log';

export const runtime = 'nodejs';
export const maxDuration = 60;

// Generate the day's suggested briefs at most once per server per UTC day. The client
// also caches per-day in localStorage, so this route is hit roughly once a day.
let cache: { date: string; briefs: string[] } | null = null;
let inflight: Promise<string[]> | null = null;

export async function GET() {
  const today = todayContext();

  if (cache?.date === today.iso && cache.briefs.length) {
    return Response.json({ date: today.iso, briefs: cache.briefs, cached: true });
  }

  try {
    // Collapse concurrent first-of-day requests into a single generation. Deliberately
    // run without a request signal so one client navigating away can't abort the shared
    // work everyone else is awaiting.
    if (!inflight) {
      inflight = generateSuggestedBriefs(today).finally(() => { inflight = null; });
    }
    const briefs = await inflight;
    if (briefs.length) cache = { date: today.iso, briefs };
    return Response.json({ date: today.iso, briefs });
  } catch (err) {
    logCall('error', { scope: 'suggested-briefs', message: err instanceof Error ? err.message : String(err) });
    // 200 with an empty list — the client falls back to its static rotation cleanly.
    return Response.json({ date: today.iso, briefs: [] });
  }
}
