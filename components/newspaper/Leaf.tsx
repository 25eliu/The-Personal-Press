import type { Block } from '@/lib/newspaper/blocks';
import type { Leaf as LeafModel } from '@/lib/newspaper/paginate';
import {
  BLOCK_GAP,
  COL_GAP,
  COL_W,
  HEADER_GAP,
  LEAF_H,
  LEAF_W,
  PAD_BOTTOM,
  PAD_TOP,
  PAD_X,
} from '@/lib/newspaper/leafLayout';
import { BlockView } from './BlockView';
import { Masthead } from './Masthead';

type Meta = { masthead: string; tagline: string; edition: string; dateLine: string };

/** Running head on every continuation/section leaf: topic + which part of how many. */
export function TopicBar({ topic, part, total, masthead }: {
  topic: string; part: number; total: number; masthead: string;
}) {
  return (
    <div className="flex items-baseline justify-between border-y-[3px] border-double border-black py-1">
      <h2 className="font-head text-lg font-black uppercase leading-none tracking-wide">{topic}</h2>
      <span className="font-mono-news text-[9px] uppercase tracking-widest text-black/70">
        {masthead}
        {total > 1 && <span className="text-[var(--accent)]"> · {part} of {total}</span>}
      </span>
    </div>
  );
}

/** A small inked jump line — the newspaper's "the story is over here" pointer. */
function JumpLine({ children }: { children: React.ReactNode }) {
  return (
    <p className="font-mono-news mt-1 text-[10px] font-bold uppercase italic tracking-wide text-[var(--accent)]">
      {children}
    </p>
  );
}

function Column({ blocks, topJump, bottomJump }: {
  blocks: Block[]; topJump?: React.ReactNode; bottomJump?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col" style={{ width: COL_W }}>
      {topJump}
      {blocks.map((b, i) => (
        <div
          key={b.id}
          style={{ marginBottom: BLOCK_GAP }}
          className={i > 0 && b.kind === 'head' ? 'border-t border-black/35 pt-2' : undefined}
        >
          <BlockView block={b} />
        </div>
      ))}
      {bottomJump}
    </div>
  );
}

/**
 * One printed sheet at the fixed leaf size. The first leaf wears the masthead; every
 * other leaf gets a topic bar labelled with its part number. The two text columns
 * are separated by a hairline rule, and a folio sits at the foot of the page.
 */
export function Leaf({ leaf, meta }: { leaf: LeafModel; meta: Meta }) {
  const toJump = leaf.continuesToNext && leaf.continuedToPage != null
    ? <JumpLine>Continued on page {leaf.continuedToPage} ▸</JumpLine>
    : undefined;
  const fromJump = leaf.continuesFromPrev && leaf.continuedFromPage != null
    ? <JumpLine>◂ Continued from page {leaf.continuedFromPage}</JumpLine>
    : undefined;

  return (
    <section
      className="paper relative flex flex-col"
      style={{ width: LEAF_W, height: LEAF_H, paddingLeft: PAD_X, paddingRight: PAD_X, paddingTop: PAD_TOP, paddingBottom: PAD_BOTTOM }}
    >
      <div style={{ marginBottom: HEADER_GAP }}>
        {leaf.isFront ? (
          <Masthead {...meta} />
        ) : (
          <TopicBar topic={leaf.topic} part={leaf.partIndex + 1} total={leaf.partCount} masthead={meta.masthead} />
        )}
      </div>

      <div className="flex flex-1 overflow-hidden">
        <Column blocks={leaf.columns[0]} topJump={fromJump} />
        <div className="flex justify-center" style={{ width: COL_GAP }}>
          <div className="w-px self-stretch bg-black/30" />
        </div>
        <Column blocks={leaf.columns[1]} bottomJump={toJump} />
      </div>

      <div className="font-mono-news absolute inset-x-0 bottom-1.5 text-center text-[9px] uppercase tracking-[0.3em] text-black/55">
        — {leaf.folio} —
      </div>
    </section>
  );
}
