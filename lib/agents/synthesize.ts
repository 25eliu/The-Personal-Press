import { generateObject } from 'ai';
import { openai } from '@ai-sdk/openai';
import { z } from 'zod';
import { MODEL } from '@/lib/config';
import { Source, type TSource } from '@/lib/schema';
import { normalizeCardSources, normalizeWebResult, validUrl } from '@/lib/tako/normalize';
import { freshnessLabel, freshnessScore, isStale, newestDate } from '@/lib/freshness';
import type { TodayContext } from '@/lib/time/clock';
import type { Findings } from '@/lib/tako/tools';
import { logCall, usageSummary } from '@/lib/log';

/** What the model returns: stories with Tako numbers paired to web narrative. */
const SynthBundle = z.object({
  title: z.string(),
  summary: z.string(),
  dataPoints: z.array(z.object({
    label: z.string(),
    value: z.string(),
    sourceName: z.string(),
    date: z.string().optional(),   // ISO; usually absent for Tako cards
  })),
  narrative: z.array(z.object({
    point: z.string(),
    sourceName: z.string(),
    date: z.string().optional(),   // copied from web publish_date when present
  })),
  sources: z.array(Source).min(1),
});
const SynthOutput = z.object({ bundles: z.array(SynthBundle) });

export type TSynthBundle = z.infer<typeof SynthBundle>;

/** A bundle after code-side freshness processing. */
export type StoryBundle = TSynthBundle & {
  /** Most recent dated source in the bundle, or undefined if all undated. */
  newestDate?: string;
  /** Within the freshness window (undated → treated as current/live data). */
  isFresh: boolean;
  /** "as of Jun 1, 2026" when the bundle is stale-but-best-available; else undefined. */
  asOf?: string;
};

/** Serialize findings for the synthesizer, surfacing dates + relevance prominently. */
export function synthInput(f: Findings): string {
  const cards = f.cards.map((c) => ({
    title: c.title,
    description: c.description ?? c.semantic_description,
    relevance: c.relevance ?? null,
    webpage_url: validUrl(c.webpage_url),
    sources: normalizeCardSources(c),
  }));
  const web = f.web.map((w) => ({
    title: w.title,
    snippet: w.snippet,
    publish_date: w.publish_date ?? null,
    source: normalizeWebResult(w),
  }));
  return JSON.stringify({ cards, web }, null, 2);
}

function synthSystem(today: TodayContext): string {
  return `You are the synthesis desk. You are given raw research (Tako data cards + web ` +
    `results) for one newspaper topic. Group it into a small set of coherent STORIES. For ` +
    `each story, pair Tako's hard numbers (dataPoints) with the web's narrative about the ` +
    `SAME story (narrative). Today is ${today.dateLine} (${today.iso}). Copy each web result's ` +
    `publish_date into the matching narrative item's "date". Prefer the most recent reporting; ` +
    `do not merge unrelated stories. Every story must carry at least one real source. Never ` +
    `invent facts, numbers, or dates — use only what the research provides.`;
}

/**
 * Compute freshness, drop stale bundles when fresher ones exist, and rank fresh-first.
 * Pure — unit-testable without the model. When ALL bundles are stale we keep them
 * (least-stale first) and stamp each "as of {date}" rather than emit nothing.
 */
export function processBundles(raw: TSynthBundle[], today: TodayContext): StoryBundle[] {
  const enriched: StoryBundle[] = raw.map((b) => {
    const dates = [...b.dataPoints.map((d) => d.date), ...b.narrative.map((n) => n.date)];
    const newest = newestDate(dates, today);
    // Undated bundles (pure live Tako cards) are treated as current.
    const fresh = newest ? !isStale(newest, today) : true;
    return { ...b, newestDate: newest, isFresh: fresh, asOf: freshnessLabel(newest, today) };
  });

  const fresh = enriched.filter((b) => b.isFresh);
  const kept = fresh.length > 0 ? fresh : enriched; // fork (b): keep best-available when none fresh
  return [...kept].sort((a, b) => freshnessScore(b.newestDate, today) - freshnessScore(a.newestDate, today));
}

/** Serialize processed bundles for the distill step. */
export function bundlesContext(bundles: StoryBundle[]): string {
  return JSON.stringify(bundles, null, 2);
}

/**
 * Synthesis stage: cluster gathered findings into per-story bundles that pair Tako
 * numbers with web narrative, then rank/filter by freshness. Throws on model failure
 * so the caller can fall back to the flat-blob path.
 */
export async function synthesizeBundles(
  topic: string,
  findings: Findings,
  today: TodayContext,
  signal?: AbortSignal,
): Promise<StoryBundle[]> {
  logCall('synthesize.start', { topic, cards: findings.cards.length, web: findings.web.length });
  const { object, usage } = await generateObject({
    model: openai(MODEL),
    schema: SynthOutput,
    system: synthSystem(today),
    prompt: `Topic: "${topic}".\n\nRESEARCH (JSON):\n${synthInput(findings)}`,
    providerOptions: { openai: { strictJsonSchema: false } },
    maxRetries: 2,
    abortSignal: signal,
  });
  const bundles = processBundles(object.bundles, today);
  logCall('synthesize.done', {
    topic, bundles: bundles.length, fresh: bundles.filter((b) => b.isFresh).length,
    usage: usageSummary(usage),
  });
  return bundles;
}

// Keep the helper near its only consumer; re-export the source type for tests.
export type { TSource };
