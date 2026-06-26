import type { TSource } from '@/lib/schema';
import type { Findings } from '@/lib/tako/tools';
import { normalizeCardSources, normalizeWebResult } from '@/lib/tako/normalize';

/** Bare hostname (no www.) for a URL, or undefined if it can't be parsed. */
function hostname(url: string): string | undefined {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return undefined;
  }
}

/**
 * A short, human-readable label for a source: its name if it's tidy, otherwise the
 * bare hostname (so a long article title collapses to e.g. "reuters.com"). Used to
 * show readers the *specific* outlets a reporter is pulling from on the wire.
 */
export function shortSourceLabel(s: TSource): string {
  const name = s.name?.trim();
  if (name && name.length <= 30) return name;
  const host = s.url ? hostname(s.url) : undefined;
  if (host) return host;
  return name ? `${name.slice(0, 29)}…` : 'Tako';
}

/**
 * Distinct, concise source labels discovered in a set of findings, capped so the
 * wire stays legible. Order-preserving (first seen wins), deduped case-insensitively.
 */
export function findingSourceLabels(f: Findings, cap = 8): string[] {
  const all: TSource[] = [
    ...f.cards.flatMap(normalizeCardSources),
    ...f.web.map(normalizeWebResult),
  ];
  const seen = new Set<string>();
  const labels: string[] = [];
  for (const s of all) {
    const label = shortSourceLabel(s);
    const key = label.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    labels.push(label);
    if (labels.length >= cap) break;
  }
  return labels;
}
