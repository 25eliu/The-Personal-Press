import type { TPage } from '@/lib/schema';

/** Reduce a possibly-verbose research topic to a short printed section title. */
export function shortSectionTitle(topic: string): string {
  // Verbose topics usually read "Short Label: long explanation…" — keep the label.
  let t = topic.split(/[:–—]/)[0].trim();
  if (t.length > 56) t = t.split(/\s+/).slice(0, 8).join(' ');
  return t.replace(/[.,;]+$/, '').trim();
}

/** Serialize an existing section into grounding context for re-research. */
export function sectionToContext(page: TPage): string {
  const lines = page.articles.map(
    (a) => `- ${a.headline}${a.dek ? ` — ${a.dek}` : ''}\n  ${a.body}`,
  );
  return `Section topic: "${page.topic}"\nExisting articles:\n${lines.join('\n')}`;
}
