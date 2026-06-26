import { runEditor } from '@/lib/agents/editor';
import { hasRealContent, runReporter } from '@/lib/agents/reporter';
import type { GenerateEvent, SectionPlanItem } from '@/lib/stream/events';
import type { TNewspaper, TPage, TSectionPlan } from '@/lib/schema';
import { todayContext } from '@/lib/time/clock';
import { clip, logCall } from '@/lib/log';

export async function orchestrate(
  brief: string,
  emit: (e: GenerateEvent) => void,
  signal?: AbortSignal,
): Promise<void> {
  // Stamp "today" ONCE per run so the editor, every reporter, and the masthead
  // all agree on the date — the foundation of the freshness fix.
  const today = todayContext();
  logCall('request', { brief: clip(brief), today: today.iso });
  if (signal?.aborted) return;
  let plan: TSectionPlan;
  try {
    logCall('editor.start', { brief: clip(brief) });
    plan = await runEditor(brief, today, signal);
    logCall('editor.done', { masthead: plan.masthead, sections: plan.sections.map((s) => s.topic) });
  } catch (err) {
    if (signal?.aborted) return;
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
      const page = await runReporter(topic, slot === 0, plan.masthead, today, (a) =>
        emit({ type: 'tool_activity', slot, topic, tool: a.tool, label: a.label, detail: a.detail }),
        signal,
      );
      pages[slot] = page;
      emit({ type: 'section_done', slot, page });
    }),
  );

  if (signal?.aborted) return;

  const newspaper: TNewspaper = {
    masthead: plan.masthead, tagline: plan.tagline, edition: plan.edition, dateLine: plan.dateLine,
    // Drop sections that produced nothing ("No fresh reporting on the wire").
    pages: pages.filter((p): p is TPage => p !== null && hasRealContent(p)),
  };
  emit({ type: 'complete', newspaper });
}
