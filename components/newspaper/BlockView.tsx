import type { Block } from '@/lib/newspaper/blocks';
import { FIGURE_MAX_H } from '@/lib/newspaper/leafLayout';
import { useLiveEdit, liveHeadline, liveDek, liveBodyChars, liveCaretInHead } from '@/lib/edition/liveEdit';
import { DataTable } from './DataTable';
import { SourceCredit } from './SourceCredit';

// Column-tuned headline sizes — smaller than the front-page treatment so a lead
// still reads as a lead inside a ~260px measure without swallowing the column.
const HEADLINE_SIZE: Record<Block['article']['size'], string> = {
  lead: 'text-2xl',
  standard: 'text-lg',
  brief: 'text-base',
};

const PARA_CLASS = 'text-justify text-[12px] leading-relaxed';
const Caret = () => <span className="tw-caret">▍</span>;

/**
 * Renders a single paginated block. The SAME component is used both in the hidden
 * measuring pass and in the real leaves, so measured heights match what the reader
 * actually sees — that's what keeps every page the exact fixed size.
 */
export function BlockView({ block }: { block: Block }) {
  const { kind, article } = block;
  // While the Copy Desk is rewriting THIS article, the head + paragraph blocks animate
  // (erase → wait → type) instead of rendering statically. The measurer never sees this:
  // a live edit never changes `pages`, so the paginator doesn't re-measure while it plays.
  const live = useLiveEdit();
  const liveTarget = live.phase !== 'idle' && live.articleKey === block.articleKey;

  // HEAD — the headline (and dek) erase up to nothing, hold a caret, then type back in.
  if (liveTarget && live.animateHead && kind === 'head') {
    const headline = liveHeadline(live);
    const dek = liveDek(live);
    const inHead = liveCaretInHead(live) && live.phase !== 'settling';
    const caretInHeadline = inHead && live.revealed <= live.headline.length;
    return (
      <header>
        <p className="text-[10px] font-bold uppercase tracking-widest text-black/70">{article.kicker}</p>
        <h3 className={`font-head font-black leading-[1.05] ${HEADLINE_SIZE[article.size]}`}>
          {headline}
          {caretInHeadline && <Caret />}
        </h3>
        {live.dek && (
          <p className="mt-0.5 font-head text-[13px] italic leading-snug text-black/80">
            {dek}
            {inHead && !caretInHeadline && <Caret />}
          </p>
        )}
        <p className="mt-1 text-[9px] uppercase tracking-wide text-black/60">By {article.byline}</p>
      </header>
    );
  }

  // BODY — paragraphs erase from the bottom up, hold a caret while fetching, then retype.
  if (liveTarget && kind === 'para') {
    if (live.phase === 'erasing') {
      // Bottom-up erase: spend the shrinking body-char budget across the article's paras
      // in order, so the body unwrites from its tail while the layout stays put.
      let before = 0;
      for (let i = 0; i < block.paraIndex; i++) before += live.paras[i]?.length ?? 0;
      const full = live.paras[block.paraIndex] ?? block.text ?? '';
      const remaining = liveBodyChars(live) - before;
      const shown = remaining <= 0 ? '' : full.slice(0, Math.min(full.length, remaining));
      const active = remaining > 0 && remaining < full.length;
      return (
        <p className={`${PARA_CLASS} ${block.isLeadFirstPara ? 'dropcap' : ''}`}>
          {shown}
          {active && <Caret />}
        </p>
      );
    }
    if (live.phase === 'waiting') {
      // Body is empty; the caret waits in the head when the title animates, else here.
      if (block.paraIndex === 0) {
        return (
          <p className={`${PARA_CLASS} ${block.isLeadFirstPara ? 'dropcap' : ''}`}>
            {!live.animateHead && <Caret />}
          </p>
        );
      }
      return null;
    }
    // typing / settling — the whole new body retypes into the first paragraph slot;
    // the article's other paragraph blocks collapse until the real layout settles.
    if (block.paraIndex === 0) {
      const parts = live.body.slice(0, liveBodyChars(live)).split('\n');
      const showCaret = live.phase === 'typing' && !liveCaretInHead(live);
      return (
        <div className="live-edit-body">
          {parts.map((p, i) => (
            <p
              key={i}
              className={`${PARA_CLASS} ${i > 0 ? 'mt-2' : ''} ${i === 0 && block.isLeadFirstPara ? 'dropcap' : ''}`}
            >
              {p}
              {i === parts.length - 1 && showCaret && <Caret />}
            </p>
          ))}
        </div>
      );
    }
    return null;
  }

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
