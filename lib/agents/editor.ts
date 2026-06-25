import { generateObject } from 'ai';
import { openai } from '@ai-sdk/openai';
import { MAX_PAGES, MODEL } from '@/lib/config';
import { SectionPlan, type TSectionPlan } from '@/lib/schema';
import { EDITOR_SYSTEM, editorPrompt } from '@/lib/agents/prompts';

export async function runEditor(brief: string): Promise<TSectionPlan> {
  const { object } = await generateObject({
    model: openai(MODEL),
    schema: SectionPlan,
    system: EDITOR_SYSTEM,
    prompt: editorPrompt(brief),
  });
  return { ...object, sections: object.sections.slice(0, MAX_PAGES) };
}
