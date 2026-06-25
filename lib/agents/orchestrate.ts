import { runEditor } from '@/lib/agents/editor';
import { runReporter } from '@/lib/agents/reporter';
import type { GenerateEvent, SectionPlanItem } from '@/lib/stream/events';
import type { TNewspaper, TPage, TSectionPlan } from '@/lib/schema';
import { clip, logCall } from '@/lib/log';

export async function orchestrate(
  brief: string,
  emit: (e: GenerateEvent) => void,
): Promise<void> {
  logCall('request', { brief: clip(brief) });
  let plan: TSectionPlan;
  try {
    logCall('editor.start', { brief: clip(brief) });
    plan = await runEditor(brief);
    logCall('editor.done', { masthead: plan.masthead, sections: plan.sections.map((s) => s.topic) });
  } catch (err) {
    logCall('error', { scope: 'editor', message: err instanceof Error ? err.message : String(err) });
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
      const page = await runReporter(topic, slot === 0, plan.masthead, (a) =>
        emit({ type: 'tool_activity', slot, topic, tool: a.tool, label: a.label, detail: a.detail }),
      );
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
