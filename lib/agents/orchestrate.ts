import { runEditor } from '@/lib/agents/editor';
import { runReporter } from '@/lib/agents/reporter';
import type { GenerateEvent, SectionPlanItem } from '@/lib/stream/events';
import type { TNewspaper, TPage } from '@/lib/schema';

export async function orchestrate(
  brief: string,
  emit: (e: GenerateEvent) => void,
): Promise<void> {
  let plan;
  try {
    plan = await runEditor(brief);
  } catch (err) {
    emit({ type: 'error', message: err instanceof Error ? err.message : 'Editor failed.' });
    return;
  }

  const planItems: SectionPlanItem[] = plan.sections.map((s, slot) => ({ topic: s.topic, slot }));
  emit({
    type: 'editor_done',
    masthead: plan.masthead, tagline: plan.tagline, edition: plan.edition, dateLine: plan.dateLine,
    plan: planItems,
  });

  const pages: (TPage | null)[] = new Array(planItems.length).fill(null);

  await Promise.allSettled(
    planItems.map(async ({ topic, slot }) => {
      emit({ type: 'section_started', slot, topic });
      const page = await runReporter(topic, slot === 0, plan!.masthead);
      pages[slot] = page;
      emit({ type: 'section_done', slot, page });
    }),
  );

  const newspaper: TNewspaper = {
    masthead: plan.masthead, tagline: plan.tagline, edition: plan.edition, dateLine: plan.dateLine,
    pages: pages.map((p, i) => p ?? { topic: planItems[i].topic, articles: [] })
                .filter((p) => p.articles.length > 0),
  };
  emit({ type: 'complete', newspaper });
}
