import { streamText, isStepCount } from 'ai';
import { openai } from '@ai-sdk/openai';
import { MODEL } from '@/lib/config';
import { buildTakoTools, collectFindings } from '@/lib/tako/tools';
import { normalizeCardSources, normalizeWebResult } from '@/lib/tako/normalize';
import { dedupeSources, findingSourceLabels } from '@/lib/tako/sources';
import { askDeskSystem } from '@/lib/agents/prompts';
import { toolDetail, toolLabel } from '@/lib/tako/labels';
import { todayContext } from '@/lib/time/clock';
import type { AskEvent } from '@/lib/stream/askEvents';
import { clip, logCall } from '@/lib/log';

/**
 * Stream a Tako-backed answer for conversational Q&A: emits a `tool` event per Tako
 * call, a `sources` event naming the concrete outlets each step pulled from, the
 * answer `token`-by-`token` as the model writes it, then a final `done` with the
 * full answer + deduped citations. Emitting deltas makes the reply appear instantly
 * instead of after the whole generation completes.
 *
 * This is the copilot chat's only Tako Q&A path. It shares the research-desk persona
 * (askDeskSystem), the time-aware tools (buildTakoTools), and source dedupe with the
 * newspaper pipeline — no forked Tako logic.
 */
export async function streamAnswerWithTako(
  query: string,
  emit: (e: AskEvent) => void,
  signal?: AbortSignal,
): Promise<void> {
  const today = todayContext();
  const tools = buildTakoTools(today);
  logCall('ask.start', { query: clip(query), model: MODEL, stream: true });

  const result = streamText({
    model: openai(MODEL),
    system: askDeskSystem(today),
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

  const finalAnswer = answer.trim() || 'No fresh data found for that question.';
  logCall('ask.done', { cards: findings.cards.length, web: findings.web.length, sources: citations.length });
  emit({ type: 'done', answer: finalAnswer, sources: citations });
}
