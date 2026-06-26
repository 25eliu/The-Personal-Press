import type { TPage } from '@/lib/schema';

/** Serialize an existing section into grounding context for re-research. */
export function sectionToContext(page: TPage): string {
  const lines = page.articles.map(
    (a) => `- ${a.headline}${a.dek ? ` — ${a.dek}` : ''}\n  ${a.body}`,
  );
  return `Section topic: "${page.topic}"\nExisting articles:\n${lines.join('\n')}`;
}
