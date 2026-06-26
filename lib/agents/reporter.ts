import { generateObject, generateText, isStepCount, streamObject } from 'ai';
import { openai } from '@ai-sdk/openai';
import { BRAND, MODEL, WORD_CAPS } from '@/lib/config';
import { Page, type TPage } from '@/lib/schema';
import { groundingBlock, reporterSystem } from '@/lib/agents/prompts';
import { buildTakoTools, collectFindings, type Findings } from '@/lib/tako/tools';
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
    return {
      ...a,
      chartImageUrl: validUrl(a.chartImageUrl),
      chartEmbedUrl: validUrl(a.chartEmbedUrl),
      sources,
    };
  });
  return { ...page, articles };
}

export function attachArt(page: TPage, f: Findings): TPage {
  const cardsWithArt = f.cards.filter((c) => validUrl(c.image_url));
  const articles = page.articles.map((a) => {
    if (a.chartImageUrl) return a;
    const aKw = keywords(`${a.headline} ${a.kicker}`);
    let best: { score: number; img?: string; embed?: string } = { score: 0 };
    for (const c of cardsWithArt) {
      const cKw = keywords(`${c.title ?? ''} ${c.description ?? ''}`);
      let score = 0;
      for (const k of aKw) if (cKw.has(k)) score++;
      if (score > best.score) {
        best = { score, img: validUrl(c.image_url), embed: validUrl(c.embed_url) };
      }
    }
    return best.score > 0 ? { ...a, chartImageUrl: best.img, chartEmbedUrl: best.embed } : a;
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
    return attachArt(sanitizePage({ ...object, topic }), findings);
  } catch (err) {
    logCall('error', { scope: 'reporter', topic, message: err instanceof Error ? err.message : String(err) });
    return emptyPage(topic);
  }
}
