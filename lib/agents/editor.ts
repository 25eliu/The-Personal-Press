import { generateObject } from 'ai';
import { openai } from '@ai-sdk/openai';
import { BRAND, MAX_PAGES, MODEL } from '@/lib/config';
import { SectionPlan, type TSectionPlan } from '@/lib/schema';
import { EDITOR_SYSTEM, editorPrompt } from '@/lib/agents/prompts';
import type { TodayContext } from '@/lib/time/clock';

export async function runEditor(
  brief: string,
  today: TodayContext,
  signal?: AbortSignal,
): Promise<TSectionPlan> {
  const { object } = await generateObject({
    model: openai(MODEL),
    schema: SectionPlan,
    system: EDITOR_SYSTEM,
    prompt: editorPrompt(brief, today),
    providerOptions: { openai: { strictJsonSchema: false } },
    abortSignal: signal,
  });
  // Masthead is the fixed brand and dateLine is the REAL date — never the model's
  // invented one (the root cause of stale-looking editions). Editor still owns
  // tagline/edition/sections.
  return {
    ...object,
    masthead: BRAND,
    dateLine: today.dateLine,
    sections: object.sections.slice(0, MAX_PAGES),
  };
}
