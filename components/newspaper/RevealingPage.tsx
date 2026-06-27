'use client';
import type { TArticle, TPage } from '@/lib/schema';
import { Masthead } from './Masthead';
import { NewsChart } from './NewsChart';
import { DataTable } from './DataTable';
import { SourceCredit } from './SourceCredit';

type Meta = { masthead: string; tagline: string; edition: string; dateLine: string };

const HEADLINE_SIZE: Record<TArticle['size'], string> = {
  lead: 'text-3xl md:text-4xl',
  standard: 'text-xl',
  brief: 'text-base',
};

const Caret = () => <span className="tw-caret">▍</span>;

/** Characters this article contributes to its page's reveal cursor (headline + dek + body). */
export function articleChars(a: TArticle): number {
  return a.headline.length + (a.dek?.length ?? 0) + a.body.length;
}

/** One article typed in top-down: kicker → headline → dek → byline → body, then its chart
 *  and sources rise in once the body is fully typed. `cursor` is chars revealed WITHIN this
 *  article (≥ its total means fully shown); `typing` marks the article holding the caret. */
function RevealingArticle({ article, cursor, typing }: { article: TArticle; cursor: number; typing: boolean }) {
  const h = article.headline.length;
  const d = article.dek?.length ?? 0;
  const b = article.body.length;
  if (cursor <= 0) return null; // not started yet

  const headline = article.headline.slice(0, Math.min(cursor, h));
  const dek = cursor > h ? (article.dek ?? '').slice(0, Math.min(cursor - h, d)) : '';
  const headDone = cursor >= h + d;
  const bodyShown = cursor > h + d ? article.body.slice(0, cursor - h - d) : '';
  const bodyDone = cursor >= h + d + b;
  const isLead = article.size === 'lead';
  const caretInHead = typing && cursor <= h + d;
  const caretInBody = typing && cursor > h + d && !bodyDone;

  return (
    <article>
      <p className="text-[10px] font-bold uppercase tracking-widest text-black/70">{article.kicker}</p>
      <h2 className={`font-head font-black leading-tight ${HEADLINE_SIZE[article.size]}`}>
        {headline}
        {caretInHead && cursor <= h && <Caret />}
      </h2>
      {article.dek && headline.length === h && (
        <p className="mt-0.5 font-head text-sm italic text-black/80">
          {dek}
          {caretInHead && cursor > h && <Caret />}
        </p>
      )}
      {headDone && <p className="mt-1 text-[10px] uppercase tracking-wide text-black/60">By {article.byline}</p>}

      {bodyDone && article.chart && article.table && (
        <div className="live-edit-rise mt-2">
          <NewsChart chart={article.chart} table={article.table} caption={article.headline} animate />
        </div>
      )}

      {cursor > h + d && (
        <div className={isLead ? 'dropcap mt-2 text-[13px] leading-relaxed' : 'mt-1 text-[12px] leading-relaxed'}>
          {bodyShown.split('\n').map((para, i, arr) => (
            <p key={i} className="mb-2 text-justify">
              {para}
              {caretInBody && i === arr.length - 1 && <Caret />}
            </p>
          ))}
        </div>
      )}

      {bodyDone && article.table && !article.chart && (
        <div className="live-edit-rise">
          <DataTable table={article.table} />
        </div>
      )}
      {bodyDone && (
        <div className="live-edit-rise">
          <SourceCredit sources={article.sources} />
        </div>
      )}
    </article>
  );
}

/**
 * A page mid-reveal, mirroring NewspaperPage's structure so it drops straight into the build
 * sheet. The page-level `cursor` is walked through each article in reading order, so stories
 * type in one after another, top-down. A `cursor` past the page's total renders it fully.
 */
export function RevealingPage({
  page,
  slot,
  meta,
  cursor,
}: {
  page: TPage;
  slot: number;
  meta: Meta;
  cursor: number;
}) {
  return (
    <section className="paper w-full px-6 py-6">
      {slot === 0 ? (
        <Masthead masthead={meta.masthead} tagline={meta.tagline} edition={meta.edition} dateLine={meta.dateLine} />
      ) : (
        <div className="mb-3 flex items-baseline justify-between border-y-[3px] border-double border-black py-1">
          <h2 className="font-head text-xl font-black uppercase tracking-wide">{page.topic}</h2>
          <span className="font-mono-news text-[9px] uppercase tracking-widest text-black/70">{meta.masthead}</span>
        </div>
      )}
      <div className="flex flex-col">
        {page.articles.map((a, i) => {
          const before = page.articles.slice(0, i).reduce((n, x) => n + articleChars(x), 0);
          const local = cursor - before; // chars revealed within this article
          if (local <= 0) return null;
          const typing = local < articleChars(a); // this article currently holds the caret
          return (
            <div key={i} className={i > 0 ? 'mt-3 border-t border-black/35 pt-3' : ''}>
              <RevealingArticle article={a} cursor={local} typing={typing} />
            </div>
          );
        })}
      </div>
    </section>
  );
}
