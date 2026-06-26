import { generateObject, generateText, isStepCount } from 'ai';
import { openai } from '@ai-sdk/openai';
import { z } from 'zod';
import { MODEL } from '@/lib/config';
import { buildTakoTools, collectFindings, type Findings } from '@/lib/tako/tools';
import { todayContext, type TodayContext } from '@/lib/time/clock';
import { logCall } from '@/lib/log';

/** How many suggested briefs to surface on the home screen each day. */
export const SUGGESTION_COUNT = 4;

/** The beats we blend across so a day's lineup spans markets, tech, sport and world. */
const BEATS = 'markets & the economy, technology & business, sports, and world/politics';

const Suggestions = z.object({
  briefs: z.array(z.string().min(3)).min(3).max(6),
});

/**
 * A compact, deduped digest of the freshest event headlines, fed to the writer LLM so
 * the suggested briefs stay anchored to what is ACTUALLY happening today rather than the
 * model's stale priors. Web results lead (they carry a publish date); cards backfill.
 */
export function eventsDigest(f: Findings, cap = 24): string {
  const seen = new Set<string>();
  const lines: string[] = [];
  const push = (title?: string | null, date?: string | null) => {
    const t = title?.trim();
    if (!t) return;
    const key = t.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    lines.push(date ? `- ${t} (${date})` : `- ${t}`);
  };
  for (const w of f.web) push(w.title, w.publish_date);
  for (const c of f.cards) push(c.title);
  return lines.slice(0, cap).join('\n');
}

/** Sweep Tako for the day's biggest stories across the beats. Best-effort: a failure
 *  here just yields an empty digest and the writer falls back to its own knowledge. */
async function discoverEvents(today: TodayContext, signal?: AbortSignal): Promise<Findings> {
  try {
    const tools = buildTakoTools(today);
    const { steps } = await generateText({
      model: openai(MODEL),
      system:
        'You are a newsroom wire editor. Use the Tako search tool to surface the most ' +
        'significant, currently-developing stories of the day. Run a few focused searches ' +
        `across ${BEATS}. Prefer topics with concrete data — prices, scores, standings, polls.`,
      prompt:
        `Today is ${today.dateLine}. Find the biggest current events right now across ` +
        `${BEATS}. Search several times so every beat is covered.`,
      tools,
      stopWhen: isStepCount(5),
      abortSignal: signal,
    });
    return collectFindings(steps);
  } catch (err) {
    logCall('error', { scope: 'suggestions.discover', message: err instanceof Error ? err.message : String(err) });
    return { cards: [], web: [] };
  }
}

/**
 * Generate today's suggested briefs from current events: search Tako for what's
 * happening, then have the editor LLM blend it into a few tap-to-read briefs. Each
 * brief mixes a handful of genuinely current topics across different beats.
 */
export async function generateSuggestedBriefs(
  today: TodayContext = todayContext(),
  signal?: AbortSignal,
): Promise<string[]> {
  const findings = await discoverEvents(today, signal);
  const digest = eventsDigest(findings);
  logCall('request', { scope: 'suggestions', date: today.iso, events: digest ? digest.split('\n').length : 0 });

  const { object } = await generateObject({
    model: openai(MODEL),
    schema: Suggestions,
    providerOptions: { openai: { strictJsonSchema: false } },
    system:
      'You write the friendly, tap-to-read "suggested briefs" on the front of a daily ' +
      'newspaper for a general audience. Each brief joins THREE current topics from different ' +
      'beats as a plain comma-separated list "A, B, C" (commas only — do NOT add the word "and") ' +
      '— e.g. "AI startups, the Fed, the Premier League" or "oil prices, the next iPhone, the NBA ' +
      'Finals". Pick big, widely-understood stories ordinary people actually care about; spread ' +
      'them across markets/economy, tech, sports, and world/culture so the set feels varied — ' +
      'not all finance.',
    prompt:
      `Today is ${today.dateLine}. Write ${SUGGESTION_COUNT} suggested briefs for today.\n` +
      'Rules:\n' +
      '- Each brief lists exactly 3 DISTINCT topics separated by commas only — "A, B, C" — with ' +
      'no "and" and no trailing period. The three should come from different beats so one tap ' +
      'covers several things at once.\n' +
      '- Across the whole set, span as many areas as possible — markets/economy, tech, sports, ' +
      'world news, and culture/science. A reader skimming the briefs should see lots of variety, ' +
      'not the same story twice. Avoid making every brief about markets.\n' +
      '- Use plain, everyday wording a casual reader understands. Say "inflation" not "PCE", ' +
      '"oil prices" not "Brent", "Middle East tensions" not "Hormuz". No acronyms or jargon.\n' +
      '- Keep each brief under ~10 words; no trailing period; never repeat a topic across briefs; ' +
      'never name a specific outlet or data provider.\n\n' +
      (digest
        ? `Today's live wire — ground the topics in these current events:\n${digest}`
        : 'No live wire is available — use your knowledge of what is newsworthy on this exact date.'),
    abortSignal: signal,
    maxRetries: 2,
  });

  const briefs = object.briefs.map((b) => b.trim()).filter(Boolean).slice(0, SUGGESTION_COUNT);
  logCall('request', { scope: 'suggestions.done', date: today.iso, count: briefs.length });
  return briefs;
}
