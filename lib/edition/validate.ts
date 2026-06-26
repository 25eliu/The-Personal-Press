import { Article, Page, type TArticle, type TPage } from '@/lib/schema';
import { sanitizePage } from '@/lib/agents/reporter';

export type ValidatedArticle = { ok: true; article: TArticle } | { ok: false; error: string };
export type ValidatedPage = { ok: true; page: TPage } | { ok: false; error: string };

/**
 * Merge a patch into an article, run it through the same sanitizer the generation
 * pipeline uses (drops bad URLs), then validate against the zod Article schema.
 * Enforces the source-integrity guardrail (`sources.min(1)`): an edit that strips
 * every source fails here and is never committed.
 */
export function validateArticlePatch(current: TArticle, patch: Partial<TArticle>): ValidatedArticle {
  const merged = { ...current, ...patch };
  // Reuse sanitizePage by wrapping the single article in a throwaway page.
  const sanitized = sanitizePage({ topic: '_', articles: [merged] });
  const parsed = Article.safeParse(sanitized.articles[0]);
  if (!parsed.success) {
    return { ok: false, error: `Invalid article after edit: ${parsed.error.issues.map((i) => i.message).join('; ')}` };
  }
  return { ok: true, article: parsed.data };
}

/** Sanitize + validate a whole page (used when merging a researched section). */
export function validatePage(page: TPage): ValidatedPage {
  const sanitized = sanitizePage(page);
  const parsed = Page.safeParse(sanitized);
  if (!parsed.success) {
    return { ok: false, error: `Invalid page: ${parsed.error.issues.map((i) => i.message).join('; ')}` };
  }
  return { ok: true, page: parsed.data };
}
