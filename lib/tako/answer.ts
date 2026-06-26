import { generateText, isStepCount } from 'ai';
import { openai } from '@ai-sdk/openai';
import { MODEL } from '@/lib/config';
import { buildTakoTools, collectFindings } from '@/lib/tako/tools';
import { normalizeCardSources, normalizeWebResult } from '@/lib/tako/normalize';
import { toolDetail, toolLabel } from '@/lib/tako/labels';
import type { ReporterActivity } from '@/lib/agents/reporter';
import type { TSource } from '@/lib/schema';
import { recencyInstruction, todayContext } from '@/lib/time/clock';
import { clip, logCall } from '@/lib/log';

export type TakoAnswer = { answer: string; sources: TSource[] };

function answerSystem(): string {
  return (
    'You are the research desk for "The Personal Press". Answer the question concisely and ' +
    'factually using the Tako tools for live data and figures. Lead with the number or finding. ' +
    'Never invent figures or sources — if Tako returns nothing usable, say so plainly.\n\n' +
    recencyInstruction(todayContext())
  );
}

/**
 * One-shot Tako-backed answer for conversational Q&A in the chat. Reuses the same
 * Tako tools as the reporter pipeline, but returns prose + sources instead of a page.
 */
export async function answerWithTako(
  query: string,
  onActivity?: (a: ReporterActivity) => void,
  signal?: AbortSignal,
): Promise<TakoAnswer> {
  const tools = buildTakoTools();
  logCall('ask.start', { query: clip(query), model: MODEL });

  const { steps, text } = await generateText({
    model: openai(MODEL),
    system: answerSystem(),
    prompt: query,
    tools,
    stopWhen: isStepCount(5),
    abortSignal: signal,
    onStepFinish: (step) => {
      for (const call of step.toolCalls ?? []) {
        const tool = call.toolName;
        onActivity?.({ tool, label: toolLabel(tool), detail: toolDetail((call as { input?: unknown }).input) });
      }
    },
  });

  const findings = collectFindings(steps);
  const sources: TSource[] = [
    ...findings.cards.flatMap(normalizeCardSources),
    ...findings.web.map(normalizeWebResult),
  ];

  // Dedupe sources by name+url and cap so the chat answer stays tidy.
  const seen = new Set<string>();
  const deduped = sources
    .filter((s) => {
      const key = `${s.name}|${s.url ?? ''}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, 6);

  const answer = text?.trim() || findings.answers.join('\n\n').trim() || 'No fresh data found for that question.';
  logCall('ask.done', { cards: findings.cards.length, web: findings.web.length, sources: deduped.length });
  return { answer, sources: deduped };
}
