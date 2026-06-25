import { generateObject } from 'ai';
import { openai } from '@ai-sdk/openai';
import { BRAND, MAX_PAGES, MODEL } from '@/lib/config';
import { SectionPlan, type TSectionPlan } from '@/lib/schema';
import { EDITOR_SYSTEM, editorPrompt } from '@/lib/agents/prompts';

export async function runEditor(brief: string): Promise<TSectionPlan> {
  const { object } = await generateObject({
    model: openai(MODEL),
    schema: SectionPlan,
    system: EDITOR_SYSTEM,
    prompt: editorPrompt(brief),
    providerOptions: { openai: { strictJsonSchema: false } },
  });
  // Masthead is the fixed brand; the editor still invents tagline/edition/dateLine/sections.
  return { ...object, masthead: BRAND, sections: object.sections.slice(0, MAX_PAGES) };
}
