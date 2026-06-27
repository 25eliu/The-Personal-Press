import { generateObject, generateText, isStepCount, streamObject } from 'ai';
import { openai } from '@ai-sdk/openai';
import { BRAND, MODEL, WORD_CAPS } from '@/lib/config';
import { Page, type TPage } from '@/lib/schema';
import { groundingBlock, reporterSystem } from '@/lib/agents/prompts';
import { buildTakoTools, collectFindings, csvForCard, type Findings } from '@/lib/tako/tools';
import { csvPreview, csvToTable } from '@/lib/tako/csv-to-table';
import { validateChartSpec } from '@/lib/newspaper/chartSpec';
import { normalizeCardSources, normalizeWebResult, validUrl } from '@/lib/tako/normalize';
import { findingSourceLabels } from '@/lib/tako/sources';
import { toolDetail, toolLabel } from '@/lib/tako/labels';
import type { TodayContext } from '@/lib/time/clock';
import { clip, logCall, usageSummary } from '@/lib/log';
import { draftFromPartial } from '@/lib/agents/draft';

/**
 * A line of newsroom activity surfaced to the UI: a Tako tool call ("Using Tako
 * search…"), or — when a step returns data — the concrete outlets it pulled from
 * ("Sourced from", carrying `sources`). One channel keeps the wire ordered.
 */
export type ReporterActivity = { tool: string; label: string; detail?: string; sources?: string[] };

export function findingsContext(f: Findings): string {
  const cards = f.cards.map((c) => ({
    title: c.title, description: c.description ?? c.semantic_description,
    image_url: validUrl(c.image_url), webpage_url: validUrl(c.webpage_url),
    // The raw numbers behind the card (header + first rows), so the model writes
    // accurate prose AND can pick a chart that fits the actual columns.
    data: csvPreview(csvForCard(c, f) ?? ''),
    sources: normalizeCardSources(c),
  }));
  const web = f.web.map((w) => ({
    title: w.title, snippet: w.snippet, publish_date: w.publish_date, source: normalizeWebResult(w),
  }));
  return JSON.stringify({ cards, web }, null, 2);
}

function keywords(s: string): Set<string> {
  return new Set(s.toLowerCase().split(/[^a-z0-9]+/).filter((w) => w.length > 3));
}

export function sanitizePage(page: TPage): TPage {
  const articles = page.articles.map((a) => {
    const sources = a.sources.map((s) => {
      const url = validUrl(s.url);
      return url ? { name: s.name, url } : { name: s.name };
    });
    return { ...a, sources };
  });
  return { ...page, articles };
}

/**
 * Attach the DATA every visual is drawn from — React charts only, never a Tako image.
 * Two data sources, in priority order:
 *  1. A card's CSV (`tako_contents`), keyword-matched to the most relevant article (each
 *     CSV card and each article used at most once, strongest overlap first). CSV is
 *     authoritative: it overrides a weaker model-transcribed table.
 *  2. The model's own `table` (numbers it transcribed from the research) for articles no
 *     CSV card matched.
 * Every resulting `table` gets a validated/inferred `chart` spec; an article with neither
 * CSV nor a model table simply has no visual. Pure: returns a new page.
 */
export function attachData(page: TPage, f: Findings): TPage {
  // Pool of CSV-bearing cards, deduped by source URL, with keyword sets for matching.
  const pool: { csv: string; title: string; kw: Set<string> }[] = [];
  const seen = new Set<string>();
  for (const c of f.cards) {
    const csv = csvForCard(c, f);
    if (!csv) continue;
    const key = c.webpage_url ?? '';
    if (key && seen.has(key)) continue;
    if (key) seen.add(key);
    pool.push({ csv, title: c.title ?? '', kw: keywords(`${c.title ?? ''} ${c.description ?? ''}`) });
  }

  // Score (article × CSV card) pairs by keyword overlap; greedy global best-match so two
  // stories can't both claim the one series they share.
  const pairs: { ai: number; pi: number; score: number }[] = [];
  page.articles.forEach((a, ai) => {
    const aKw = keywords(`${a.headline} ${a.kicker}`);
    pool.forEach((card, pi) => {
      let score = 0;
      for (const k of aKw) if (card.kw.has(k)) score++;
      if (score > 0) pairs.push({ ai, pi, score });
    });
  });
  pairs.sort((x, y) => y.score - x.score);
  const tableFor = new Map<number, ReturnType<typeof csvToTable>>();
  const usedCard = new Set<number>();
  for (const { ai, pi } of pairs) {
    if (tableFor.has(ai) || usedCard.has(pi)) continue;
    const t = csvToTable(pool[pi].csv, pool[pi].title || page.articles[ai].headline);
    if (!t) continue;
    tableFor.set(ai, t);
    usedCard.add(pi);
  }

  const articles = page.articles.map((a, ai) => {
    const table = tableFor.get(ai) ?? a.table; // CSV authoritative, else the model's table
    const chart = table ? validateChartSpec(a.chart, table) : undefined;
    if (!table) return a.chart ? { ...a, chart: undefined } : a;
    return { ...a, table, chart };
  });
  return { ...page, articles };
}

/** Headline used by the degraded fallback page; also the marker for "no content". */
export const NO_REPORT_HEADLINE = 'No fresh reporting on the wire';

export function emptyPage(topic: string): TPage {
  return {
    topic,
    articles: [{
      kicker: topic, headline: NO_REPORT_HEADLINE, byline: 'Tako Wire',
      body: 'Our reporters found no new sourced data on this topic for today’s edition.',
      size: 'brief', sources: [{ name: BRAND }],
    }],
  };
}

/** A page has real content if any article is not the "no fresh reporting" fallback. */
export function hasRealContent(page: TPage): boolean {
  return page.articles.some((a) => a.headline !== NO_REPORT_HEADLINE);
}

export function researchPrompt(topic: string, today: TodayContext, context?: string): string {
  return `Report the section: "${topic}" as of ${today.dateLine}. Stay strictly on this topic; ` +
    `gather the LATEST sourced data about it with the Tako tools.${groundingBlock(context)}`;
}

export function distillPrompt(
  topic: string,
  isFront: boolean,
  ctx: string,
  today: TodayContext,
  context?: string,
): string {
  const layout = isFront
    ? 'This is the FRONT PAGE: produce exactly one "lead" article plus 2 or 3 "brief" articles.'
    : 'This is a TOPIC PAGE: produce 2 to 4 articles sized "standard" or "brief" (at most one "lead").';
  return `Today is ${today.dateLine}. Topic: "${topic}"
${layout}${groundingBlock(context)}

Write the page strictly from the research below. Pair Tako's hard numbers with the web's narrative
about the SAME story, leading each article with the number/finding. Prefer the most recent sources;
if you must use older data, work an "as of <date>" into the kicker or dek. Every article MUST include
at least one source drawn from this research. Do not invent facts, sources, or dates. Respect word
caps (lead <= ${WORD_CAPS.lead}, standard <= ${WORD_CAPS.standard}, brief <= ${WORD_CAPS.brief}).
If the research is thin, write fewer, shorter articles rather than padding.

VISUALS ARE REACT CHARTS DRAWN FROM A "table" — there are NO images. Any article built on
numeric data MUST carry a "table" AND a "chart" so it can be drawn:
- "table": { "caption", "columns" (header names), "rows" (string cells) } holding the REAL
  numbers. If a finding includes "data" (CSV), copy those rows into the table. Otherwise
  transcribe the SPECIFIC numbers you cite in the prose (a short series of 3+ points). Never
  invent numbers — if you have no real series for a story, omit the table (it shows text only).
- "chart": { "type" (line/bar/area), "labelColumn" (x-axis/category column), "valueColumns"
  (one or more numeric series), optional "unit" "$"/"%" } — naming columns EXACTLY as they
  appear in the table header. (If you give a table but an unsure/blank chart, one is inferred.)
Prefer a time series → line/area; a category comparison → bar. Give as many stories a chart as
the data honestly supports.

RESEARCH (JSON):
${ctx}`;
}

export type ReporterOpts = {
  context?: string;
  onActivity?: (a: ReporterActivity) => void;
  onDraftToken?: (t: string) => void;   // used in Task 4; accept now, ignore here
  signal?: AbortSignal;
};

export async function runReporter(
  topic: string,
  isFront: boolean,
  masthead: string,
  today: TodayContext,
  opts: ReporterOpts = {},
): Promise<TPage> {
  const { context, onActivity, onDraftToken, signal } = opts;
  try {
    const tools = buildTakoTools(today);
    logCall('reporter.start', { slot: isFront ? 0 : undefined, topic, model: MODEL });

    const { steps, usage } = await generateText({
      model: openai(MODEL),
      system: reporterSystem(masthead, today),
      prompt: researchPrompt(topic, today, context),
      tools,
      stopWhen: isStepCount(6),
      abortSignal: signal,
      onStepFinish: (step) => {
        for (const call of step.toolCalls ?? []) {
          const tool = call.toolName;
          const detail = toolDetail((call as { input?: unknown }).input);
          logCall('tool.call', { topic, tool, detail: clip(detail) });
          onActivity?.({ tool, label: toolLabel(tool), detail });
        }
        // Surface the SPECIFIC outlets this step pulled from, the moment they land.
        const labels = findingSourceLabels(collectFindings([step]));
        if (labels.length > 0) onActivity?.({ tool: 'sources', label: 'Sourced from', sources: labels });
      },
    });

    const findings = collectFindings(steps);
    logCall('reporter.done', {
      topic, cards: findings.cards.length, web: findings.web.length,
      usage: usageSummary(usage),
    });
    if (findings.cards.length === 0 && findings.web.length === 0) {
      return emptyPage(topic);
    }

    const research = findingsContext(findings);
    logCall('distill.start', { topic, model: MODEL, stream: Boolean(onDraftToken) });
    let object: TPage;
    if (onDraftToken) {
      const result = streamObject({
        model: openai(MODEL),
        schema: Page,
        prompt: distillPrompt(topic, isFront, research, today, context),
        providerOptions: { openai: { strictJsonSchema: false } },
        abortSignal: signal,
      });
      let lastDraft = '';
      for await (const partial of result.partialObjectStream) {
        if (signal?.aborted) break;
        const full = draftFromPartial(partial as { articles?: Array<{ headline?: string; body?: string }> });
        if (full.length > lastDraft.length && full.startsWith(lastDraft)) {
          onDraftToken(full.slice(lastDraft.length));
          lastDraft = full;
        }
      }
      object = await result.object;            // validated against Page
    } else {
      const r = await generateObject({
        model: openai(MODEL),
        schema: Page,
        prompt: distillPrompt(topic, isFront, research, today, context),
        providerOptions: { openai: { strictJsonSchema: false } },
        maxRetries: 3,
        abortSignal: signal,
      });
      object = r.object;
    }
    logCall('distill.done', { topic, articles: object.articles.length });
    return attachData(sanitizePage({ ...object, topic }), findings);
  } catch (err) {
    logCall('error', { scope: 'reporter', topic, message: err instanceof Error ? err.message : String(err) });
    return emptyPage(topic);
  }
}
