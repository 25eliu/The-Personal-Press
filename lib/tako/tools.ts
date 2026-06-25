import { takoAnswer, takoContents, takoSearch } from '@takoviz/ai-sdk';
import type { TakoCard, TakoWebResult } from '@takoviz/ai-sdk';
import { SOURCE_COUNTS } from '@/lib/config';

export function buildTakoTools() {
  const sources = { tako: { count: SOURCE_COUNTS.tako }, web: { count: SOURCE_COUNTS.web } };
  return {
    tako_search: takoSearch({ effort: 'fast', sources }),
    tako_answer: takoAnswer({ sources }),
    tako_contents: takoContents({ mode: 'inline' }),
  };
}

export type Findings = { cards: TakoCard[]; web: TakoWebResult[]; answers: string[] };

type LooseToolResult = { toolName?: string; output?: unknown; result?: unknown };
type LooseStep = { toolResults?: LooseToolResult[] };

export function collectFindings(steps: LooseStep[] | undefined): Findings {
  const findings: Findings = { cards: [], web: [], answers: [] };
  for (const step of steps ?? []) {
    for (const tr of step.toolResults ?? []) {
      const out = (tr.output ?? tr.result) as
        | { cards?: TakoCard[]; web_results?: TakoWebResult[]; answer?: string }
        | undefined;
      if (!out) continue;
      if (Array.isArray(out.cards)) findings.cards.push(...out.cards);
      if (Array.isArray(out.web_results)) findings.web.push(...out.web_results);
      if (typeof out.answer === 'string' && out.answer.trim()) findings.answers.push(out.answer);
    }
  }
  return findings;
}
