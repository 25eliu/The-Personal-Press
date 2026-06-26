type PartialArticle = { headline?: string; body?: string } | undefined;
type PartialPage = { articles?: PartialArticle[] } | undefined;

/** Build a stable, prefix-only-growing prose preview from a streaming partial Page. */
export function draftFromPartial(partial: PartialPage): string {
  const out: string[] = [];
  for (const a of partial?.articles ?? []) {
    if (!a) break;                       // stop at first absent article (order matters)
    if (a.headline) out.push(a.headline);
    if (a.body) out.push(a.body);
  }
  return out.join('\n\n');
}
