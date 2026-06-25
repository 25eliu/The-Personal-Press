import type { TakoCard, TakoWebResult } from '@takoviz/ai-sdk';
import type { TSource } from '@/lib/schema';

export function validUrl(u: unknown): string | undefined {
  if (typeof u !== 'string' || u.trim() === '') return undefined;
  try {
    const parsed = new URL(u);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:' ? u : undefined;
  } catch {
    return undefined;
  }
}

export function sourceIndexLabel(idx: unknown): string {
  if (typeof idx === 'string') return idx;
  if (idx && typeof idx === 'object' && 'index_type' in idx) {
    return String((idx as { index_type: unknown }).index_type);
  }
  return 'tako';
}

export function normalizeCardSources(card: TakoCard): TSource[] {
  const fallbackUrl = validUrl(card.webpage_url);
  const named = (card.sources ?? [])
    .map((s) => {
      const name = s.source_name?.trim();
      if (!name) return undefined;
      const url = validUrl(s.url) ?? fallbackUrl;
      return url ? { name, url } : { name };
    })
    .filter((x): x is TSource => Boolean(x));

  if (named.length > 0) return named;

  const fallbackName = card.title?.trim() || 'Tako';
  return [fallbackUrl ? { name: fallbackName, url: fallbackUrl } : { name: fallbackName }];
}

export function normalizeWebResult(w: TakoWebResult): TSource {
  const name = w.source_name?.trim() || w.title;
  const url = validUrl(w.url);
  return url ? { name, url } : { name };
}
