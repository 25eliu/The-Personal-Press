import { generateObject, generateText, isStepCount } from 'ai';
import { openai } from '@ai-sdk/openai';
import { MODEL, WORD_CAPS } from '@/lib/config';
import { Page, type TPage } from '@/lib/schema';
import { reporterSystem } from '@/lib/agents/prompts';
import { buildTakoTools, collectFindings, type Findings } from '@/lib/tako/tools';
import { normalizeCardSources, normalizeWebResult, validUrl } from '@/lib/tako/normalize';
import { toolDetail, toolLabel } from '@/lib/tako/labels';
import { clip, logCall, usageSummary } from '@/lib/log';

/** A single Tako tool call surfaced to the UI ("Using Tako search…"). */
export type ReporterActivity = { tool: string; label: string; detail?: string };

export function findingsContext(f: Findings): string {
  const cards = f.cards.map((c) => ({
    title: c.title, description: c.description ?? c.semantic_description,
    image_url: validUrl(c.image_url), webpage_url: validUrl(c.webpage_url),
    sources: normalizeCardSources(c),
  }));
  const web = f.web.map((w) => ({
    title: w.title, snippet: w.snippet, publish_date: w.publish_date, source: normalizeWebResult(w),
  }));
  return JSON.stringify({ answers: f.answers, cards, web }, null, 2);
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

export function emptyPage(topic: string): TPage {
  return {
    topic,
    articles: [{
      kicker: topic, headline: 'No fresh reporting on the wire', byline: 'Tako Wire',
      body: 'Our reporters found no new sourced data on this topic for today’s edition.',
      size: 'brief', sources: [{ name: 'The Daily Tako' }],
    }],
  };
}

function distillPrompt(topic: string, isFront: boolean, ctx: string): string {
  const layout = isFront
    ? 'This is the FRONT PAGE: produce exactly one "lead" article plus 2 or 3 "brief" articles.'
    : 'This is a TOPIC PAGE: produce 2 to 4 articles sized "standard" or "brief" (at most one "lead").';
  return `Topic: "${topic}"
${layout}

Write the page strictly from the research below. Every article MUST include at least one source
drawn from this research. Do not invent facts or sources. Respect word caps
(lead <= ${WORD_CAPS.lead}, standard <= ${WORD_CAPS.standard}, brief <= ${WORD_CAPS.brief}).
If the research is thin, write fewer, shorter articles rather than padding.

RESEARCH (JSON):
${ctx}`;
}

export async function runReporter(
  topic: string,
  isFront: boolean,
  masthead: string,
  onActivity?: (a: ReporterActivity) => void,
): Promise<TPage> {
  try {
    const tools = buildTakoTools();
    logCall('reporter.start', { slot: isFront ? 0 : undefined, topic, model: MODEL });

    const { steps, usage } = await generateText({
      model: openai(MODEL),
      system: reporterSystem(masthead),
      prompt: `Report the section: "${topic}". Gather sourced data with the Tako tools.`,
      tools,
      stopWhen: isStepCount(6),
      onStepFinish: (step) => {
        for (const call of step.toolCalls ?? []) {
          const tool = call.toolName;
          const detail = toolDetail((call as { input?: unknown }).input);
          logCall('tool.call', { topic, tool, detail: clip(detail) });
          onActivity?.({ tool, label: toolLabel(tool), detail });
        }
      },
    });

    const findings = collectFindings(steps);
    logCall('reporter.done', {
      topic, cards: findings.cards.length, web: findings.web.length,
      answers: findings.answers.length, usage: usageSummary(usage),
    });

    if (findings.cards.length === 0 && findings.web.length === 0 && findings.answers.length === 0) {
      return emptyPage(topic);
    }

    logCall('distill.start', { topic, model: MODEL });
    const { object, usage: distillUsage } = await generateObject({
      model: openai(MODEL),
      schema: Page,
      prompt: distillPrompt(topic, isFront, findingsContext(findings)),
    });
    logCall('distill.done', { topic, articles: object.articles.length, usage: usageSummary(distillUsage) });

    return attachArt(sanitizePage({ ...object, topic }), findings);
  } catch (err) {
    logCall('error', { scope: 'reporter', topic, message: err instanceof Error ? err.message : String(err) });
    return emptyPage(topic);
  }
}
