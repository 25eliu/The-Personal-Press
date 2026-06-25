import type { TArticle } from '@/lib/schema';
import { DataTable } from './DataTable';
import { Figure } from './Figure';
import { SourceCredit } from './SourceCredit';

const HEADLINE_SIZE: Record<TArticle['size'], string> = {
  lead: 'text-3xl md:text-4xl',
  standard: 'text-xl',
  brief: 'text-base',
};

export function Article({ article }: { article: TArticle }) {
  const isLead = article.size === 'lead';
  return (
    <article className="mb-4 break-inside-avoid">
      <p className="text-[10px] font-bold uppercase tracking-widest text-black/70">{article.kicker}</p>
      <h2 className={`font-head font-black leading-tight ${HEADLINE_SIZE[article.size]}`}>{article.headline}</h2>
      {article.dek && <p className="mt-0.5 font-head text-sm italic text-black/80">{article.dek}</p>}
      <p className="mt-1 text-[10px] uppercase tracking-wide text-black/60">By {article.byline}</p>

      {article.chartImageUrl && (
        <Figure src={article.chartImageUrl} caption={article.headline} sources={article.sources} />
      )}

      <div className={isLead ? 'dropcap mt-2 text-[13px] leading-relaxed' : 'mt-1 text-[12px] leading-relaxed'}>
        {article.body.split('\n').map((para, i) => (
          <p key={i} className="mb-2 text-justify">{para}</p>
        ))}
      </div>

      {article.table && <DataTable table={article.table} />}
      <SourceCredit sources={article.sources} />
    </article>
  );
}
