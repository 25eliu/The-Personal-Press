import type { GenerateEvent, SectionPlanItem } from '@/lib/stream/events';
import type { TNewspaper, TPage } from '@/lib/schema';

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Distinct source-outlet names across a page's articles, in first-seen order. */
function pageSources(page: TPage, cap = 4): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const a of page.articles) {
    for (const s of a.sources ?? []) {
      const key = s.name.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(s.name);
      if (out.length >= cap) return out;
    }
  }
  return out;
}

/**
 * Replay a cached edition through the SAME live-build UI as a fresh generation —
 * the wire ticker, the "Sourced from" rail, and the press progress bar — but compressed
 * into a short buffer. Even though the paper already exists, we drip a few synthetic
 * dispatches and tick the section progress so a cached example still reads as "the
 * newsroom is working" for a beat, then snaps to the finished paper quickly.
 *
 * `stopped()` lets the caller abort (e.g. the reader hit "New paper" mid-replay).
 */
export async function replayCachedEdition(
  newspaper: TNewspaper,
  onEvent: (e: GenerateEvent) => void,
  stopped: () => boolean,
): Promise<void> {
  if (stopped()) return;
  const pages = newspaper.pages as TPage[];
  const plan: SectionPlanItem[] = pages.map((p, slot) => ({ topic: p.topic, slot }));

  onEvent({
    type: 'editor_done',
    masthead: newspaper.masthead,
    tagline: newspaper.tagline,
    edition: newspaper.edition,
    dateLine: newspaper.dateLine,
    plan,
  });

  // A short beat on "planning" before sections start filing.
  await wait(240);

  // File each section in a quick stagger so the ticker flashes a few dispatches and the
  // progress bar climbs — capped tight so the whole buffer stays well under two seconds.
  await Promise.all(
    pages.map(async (page, slot) => {
      await wait(150 + slot * 130);
      if (stopped()) return;
      onEvent({
        type: 'tool_activity',
        slot,
        topic: page.topic,
        tool: 'tako_search',
        label: 'Using Tako search',
        detail: page.topic,
        sources: pageSources(page),
      });
      await wait(210);
      if (stopped()) return;
      onEvent({ type: 'section_done', slot, page });
    }),
  );

  if (stopped()) return;
  onEvent({ type: 'complete', newspaper });
}
