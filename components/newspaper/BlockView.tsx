import type { Block } from '@/lib/newspaper/blocks';
import { FIGURE_MAX_H } from '@/lib/newspaper/leafLayout';
import { DataTable } from './DataTable';
import { SourceCredit } from './SourceCredit';

// Column-tuned headline sizes — smaller than the front-page treatment so a lead
// still reads as a lead inside a ~260px measure without swallowing the column.
const HEADLINE_SIZE: Record<Block['article']['size'], string> = {
  lead: 'text-2xl',
  standard: 'text-lg',
  brief: 'text-base',
};

/**
 * Renders a single paginated block. The SAME component is used both in the hidden
 * measuring pass and in the real leaves, so measured heights match what the reader
 * actually sees — that's what keeps every page the exact fixed size.
 */
export function BlockView({ block }: { block: Block }) {
  const { kind, article } = block;

  if (kind === 'head') {
    return (
      <header>
        <p className="text-[10px] font-bold uppercase tracking-widest text-black/70">{article.kicker}</p>
        <h3 className={`font-head font-black leading-[1.05] ${HEADLINE_SIZE[article.size]}`}>{article.headline}</h3>
        {article.dek && <p className="mt-0.5 font-head text-[13px] italic leading-snug text-black/80">{article.dek}</p>}
        <p className="mt-1 text-[9px] uppercase tracking-wide text-black/60">By {article.byline}</p>
      </header>
    );
  }

  if (kind === 'figure' && article.chartImageUrl) {
    return (
      <figure className="border border-black/80 p-1">
        <div className="halftone overflow-hidden">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={article.chartImageUrl}
            alt={article.headline}
            className="w-full object-contain"
            style={{ maxHeight: FIGURE_MAX_H }}
          />
        </div>
        <figcaption className="mt-1 text-[10px] italic leading-snug">{article.headline}</figcaption>
      </figure>
    );
  }

  if (kind === 'para') {
    return (
      <p
        className={`text-justify text-[12px] leading-relaxed ${block.isLeadFirstPara ? 'dropcap' : ''}`}
      >
        {block.text}
      </p>
    );
  }

  if (kind === 'table' && article.table) {
    return <DataTable table={article.table} />;
  }

  if (kind === 'sources') {
    return <SourceCredit sources={article.sources} />;
  }

  return null;
}
