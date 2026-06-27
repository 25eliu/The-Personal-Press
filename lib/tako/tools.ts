import { takoContents, takoSearch } from '@takoviz/ai-sdk';
import type { TakoCard, TakoContentItem, TakoWebResult } from '@takoviz/ai-sdk';
import { SOURCE_COUNTS, TIMEZONE } from '@/lib/config';
import { timeAwareQuery } from '@/lib/tako/recency';
import type { TodayContext } from '@/lib/time/clock';

/**
 * The Tako tools handed to the research LLMs. We deliberately do NOT include
 * `tako_answer`: it is `tako_search` + an LLM synthesis, and every caller already
 * runs its own LLM over the raw findings — so the synthesized answer is redundant.
 *
 * `tako_search` is wrapped so every query is made time-aware before it hits Tako
 * (cards carry no date; the query is the only recency lever). `today` is the run's
 * single date stamp, threaded in so a request stays internally consistent.
 */
export function buildTakoTools(today: TodayContext) {
  const sources = { tako: { count: SOURCE_COUNTS.tako }, web: { count: SOURCE_COUNTS.web } };
  const search = takoSearch({ effort: 'fast', sources, timezone: TIMEZONE });
  return {
    tako_search: {
      ...search,
      execute: (input: { query: string }, options: Parameters<NonNullable<typeof search.execute>>[1]) =>
        search.execute!({ ...input, query: timeAwareQuery(input.query, today) }, options),
    },
    tako_contents: takoContents({ mode: 'inline' }),
  };
}

export type Findings = { cards: TakoCard[]; web: TakoWebResult[]; contents: TakoContentItem[] };

type LooseToolResult = { toolName?: string; output?: unknown; result?: unknown };
type LooseStep = { toolResults?: LooseToolResult[] };

export function collectFindings(steps: LooseStep[] | undefined): Findings {
  const findings: Findings = { cards: [], web: [], contents: [] };
  for (const step of steps ?? []) {
    for (const tr of step.toolResults ?? []) {
      const out = (tr.output ?? tr.result) as
        | { cards?: TakoCard[]; web_results?: TakoWebResult[]; contents?: TakoContentItem[] }
        | undefined;
      if (!out) continue;
      if (Array.isArray(out.cards)) findings.cards.push(...out.cards);
      if (Array.isArray(out.web_results)) findings.web.push(...out.web_results);
      // `tako_contents` returns the raw numbers behind a card (CSV/text). Without this,
      // those numbers are dropped and only the card's pre-rendered image survives.
      if (Array.isArray(out.contents)) findings.contents.push(...out.contents);
    }
  }
  return findings;
}

/**
 * The CSV a `tako_contents` call pulled for a given card. A contents item echoes the
 * card's `webpage_url` back as its `source_url`, so we match on that. Returns the raw
 * CSV string (only when the item is CSV-formatted and carries data), else undefined.
 */
export function csvForCard(card: TakoCard, findings: Findings): string | undefined {
  const url = card.webpage_url;
  if (!url) return undefined;
  const hit = findings.contents.find(
    (c) => c.source_url === url && c.format === 'csv' && typeof c.data === 'string' && c.data.trim() !== '',
  );
  return hit?.data ?? undefined;
}
