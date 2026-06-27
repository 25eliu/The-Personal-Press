import type { Block } from '@/lib/newspaper/blocks';
import {
  useLiveEdit,
  liveHeadline,
  liveDek,
  liveBodyChars,
  liveCaretInHead,
  liveHeadDone,
  liveBodyDone,
  liveHeadlineErasing,
  liveDekErasing,
  liveEraseFrac,
} from '@/lib/edition/liveEdit';
import { DataTable } from './DataTable';
import { NewsChart } from './NewsChart';
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

  // WHOLE-SECTION replace: every OTHER article on the page collapses while the lead
  // typewriters out and back in, so the entire section clears — not just its lead. These
  // siblings reappear (risen in, see Leaf) only once the new section commits.
  if (
    live.sectionScope &&
    live.phase !== 'idle' &&
    live.slot === block.topicIndex &&
    block.articleKey !== live.articleKey
  ) {
    return null;
  }

  // HEAD — the kicker, headline, dek and byline ALL erase up to nothing, hold a caret,
  // then stream back in. Nothing in the head (not even the "By …" line) lingers.
  if (liveTarget && live.animateHead && kind === 'head') {
    const erasing = live.phase === 'erasing';
    const waiting = live.phase === 'waiting';
    const streaming = live.phase === 'typing' || live.phase === 'settling';
    // Mid-erase the title + dek shrink in step with the body so the whole scope clears
    // together; otherwise they reveal/hold top-down (typing, waiting, settling).
    const headline = erasing ? liveHeadlineErasing(live) : liveHeadline(live);
    const dek = erasing ? liveDekErasing(live) : liveDek(live);
    const inHead = !erasing && liveCaretInHead(live) && live.phase !== 'settling';
    const caretInHeadline = inHead && live.revealed <= live.headline.length;
    // The kicker (above the headline) and byline (below the head) are part of the scope:
    // they fade out WITH the erase, vanish while the caret waits, and stream back — the
    // kicker as the title starts, the byline once the title+dek are fully in.
    const frac = liveEraseFrac(live);
    const kickerOpacity = erasing ? frac : waiting ? 0 : 1;
    const bylineOpacity = erasing ? frac : streaming && liveHeadDone(live) ? 1 : 0;
    const kickerText = streaming ? live.kicker ?? article.kicker : article.kicker;
    const bylineText = streaming ? live.byline ?? article.byline : article.byline;
    return (
      <header>
        <p className="text-[10px] font-bold uppercase tracking-widest text-black/70" style={{ opacity: kickerOpacity }}>
          {kickerText}
        </p>
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
        <p className="mt-1 text-[9px] uppercase tracking-wide text-black/60" style={{ opacity: bylineOpacity }}>
          By {bylineText}
        </p>
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

  // STRUCTURAL (chart / table / sources) — only when the WHOLE article is being swapped.
  // They clear with the text during erase/wait, then reload the NEW content from live
  // state during typing, gated to their reading-order spot so they load in rather than
  // pop at commit. Body-only edits (live.whole === false) skip this and render statically
  // below, leaving the chart/sources untouched. Only blocks that already exist in this
  // article's shred animate; a chart added to a story that had none appears at the commit.
  if (liveTarget && live.whole && (kind === 'chart' || kind === 'table' || kind === 'sources')) {
    if (live.phase === 'erasing' || live.phase === 'waiting') return null;
    if (kind === 'chart') {
      // The interactive chart sits just below the head; reload it from live state once the
      // headline+dek are in so it rises with the new copy.
      if (!live.chart || !live.table || !liveHeadDone(live)) return null;
      return (
        <div className="live-edit-rise">
          <NewsChart chart={live.chart} table={live.table} caption={live.headline} />
        </div>
      );
    }
    if (kind === 'table') {
      if (!live.table || !liveBodyDone(live)) return null;
      return (
        <div className="live-edit-rise">
          <DataTable table={live.table} />
        </div>
      );
    }
    // sources
    if (!live.sources || !liveBodyDone(live)) return null;
    return (
      <div className="live-edit-rise">
        <SourceCredit sources={live.sources} />
      </div>
    );
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

  if (kind === 'chart' && article.chart && article.table) {
    return <NewsChart chart={article.chart} table={article.table} caption={article.headline} />;
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
