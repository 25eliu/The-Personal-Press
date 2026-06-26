import { streamText, isStepCount } from 'ai';
import { openai } from '@ai-sdk/openai';
import { MODEL } from '@/lib/config';
import { buildTakoTools, collectFindings } from '@/lib/tako/tools';
import { normalizeCardSources, normalizeWebResult } from '@/lib/tako/normalize';
import { findingSourceLabels } from '@/lib/tako/sources';
import { toolDetail, toolLabel } from '@/lib/tako/labels';
import { recencyInstruction, todayContext } from '@/lib/time/clock';
import type { TSource } from '@/lib/schema';
import type { AskEvent } from '@/lib/stream/askEvents';
import { clip, logCall } from '@/lib/log';

// Streaming sibling of lib/tako/answer.ts#answerWithTako. Kept in its own file so the
// token-streamed Q&A path doesn't have to edit the (separately-evolving) answer.ts.
// Mirrors that file's research-desk persona + recency instruction.
function answerSystem(): string {
  return (
    'You are the research desk for "The Personal Press". Answer the question concisely and ' +
    'factually using the Tako tools for live data and figures. Lead with the number or finding. ' +
    'Never invent figures or sources — if Tako returns nothing usable, say so plainly.\n\n' +
    recencyInstruction(todayContext())
  );
}

function dedupeSources(sources: TSource[], cap = 6): TSource[] {
  const seen = new Set<string>();
  return sources
    .filter((s) => {
      const key = `${s.name}|${s.url ?? ''}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, cap);
}

/**
 * Stream a Tako-backed answer for conversational Q&A: emits a `tool` event per Tako
 * call, a `sources` event naming the concrete outlets each step pulled from, the
 * answer `token`-by-`token` as the model writes it, then a final `done` with the
 * full answer + deduped citations. Emitting deltas makes the reply appear instantly
 * instead of after the whole generation completes.
 */
export async function streamAnswerWithTako(
  query: string,
  emit: (e: AskEvent) => void,
  signal?: AbortSignal,
): Promise<void> {
  const tools = buildTakoTools();
  logCall('ask.start', { query: clip(query), model: MODEL, stream: true });

  const result = streamText({
    model: openai(MODEL),
    system: answerSystem(),
    prompt: query,
    tools,
    stopWhen: isStepCount(5),
    abortSignal: signal,
    onStepFinish: (step) => {
      for (const call of step.toolCalls ?? []) {
        const tool = call.toolName;
        emit({ type: 'tool', label: toolLabel(tool), detail: toolDetail((call as { input?: unknown }).input) });
      }
      // Surface the SPECIFIC outlets this step pulled from, the moment they land.
      const labels = findingSourceLabels(collectFindings([step]));
      if (labels.length > 0) emit({ type: 'sources', sources: labels });
    },
  });

  let answer = '';
  for await (const delta of result.textStream) {
    if (signal?.aborted) break;
    answer += delta;
    emit({ type: 'token', text: delta });
  }

  const findings = collectFindings(await result.steps);
  const citations = dedupeSources([
    ...findings.cards.flatMap(normalizeCardSources),
    ...findings.web.map(normalizeWebResult),
  ]);

  const finalAnswer =
    answer.trim() || findings.answers.join('\n\n').trim() || 'No fresh data found for that question.';
  logCall('ask.done', { cards: findings.cards.length, web: findings.web.length, sources: citations.length });
  emit({ type: 'done', answer: finalAnswer, sources: citations });
}
