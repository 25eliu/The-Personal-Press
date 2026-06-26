'use client';
import { motion } from 'framer-motion';

export type BuildStage = 'planning' | 'typesetting' | 'printing';

const STAGE_COPY: Record<BuildStage, { chip: string; line: string }> = {
  planning: { chip: 'Planning', line: 'Assigning reporters & planning today’s sections' },
  typesetting: { chip: 'Typesetting', line: 'Reporters filing — setting the type' },
  printing: { chip: 'On the press', line: 'Rolling the press — printing your edition' },
};

/**
 * The press console: a plain-language status strip beneath the live wire that
 * tells the reader exactly what stage the edition is in and how far along it is.
 * Pairs with WireTicker (which shows the live tool calls) — this one answers
 * "what's happening and how much is left", the single biggest clarity gap during
 * the build.
 */
export function BuildStatus({
  stage,
  done,
  total,
  takoCount,
  masthead,
  dateLine,
  brief,
}: {
  stage: BuildStage;
  done: number;
  total: number;
  takoCount: number;
  masthead: string;
  dateLine: string;
  brief: string;
}) {
  const copy = STAGE_COPY[stage];
  const indeterminate = stage === 'planning' || total === 0;
  const pct = stage === 'printing' ? 1 : total > 0 ? done / total : 0;
  const isAccent = stage !== 'typesetting';

  return (
    <motion.div
      initial={{ opacity: 0, y: -8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className="paper-slip font-mono-news w-full max-w-[1340px] overflow-hidden rounded-sm border border-[var(--ink)]/30 px-3 py-2"
    >
      <div className="flex items-center gap-3">
        {/* Stage badge */}
        <span
          className={`shrink-0 rounded-sm px-2 py-1 text-[10px] font-bold uppercase tracking-[0.18em] ${
            isAccent ? 'bg-[var(--accent)] text-[var(--paper)]' : 'bg-[var(--ink)] text-[var(--paper)]'
          }`}
        >
          <span className="live-dot mr-1">●</span>
          {copy.chip}
        </span>

        {/* Stage line + edition identity */}
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline justify-between gap-2">
            <p className="truncate text-[12px] text-[var(--ink)]">
              {copy.line}
              {stage === 'planning' && brief && (
                <span className="text-[var(--ink)]/55"> — “{brief}”</span>
              )}
            </p>
            <p className="hidden shrink-0 text-[10px] uppercase tracking-widest text-[var(--ink)]/45 sm:block">
              {masthead ? (
                <>
                  {masthead}
                  {dateLine && <span className="text-[var(--ink)]/35"> · {dateLine}</span>}
                </>
              ) : (
                'The Personal Press'
              )}
            </p>
          </div>

          {/* Progress track */}
          <div className="press-track mt-1.5 h-[6px] w-full overflow-hidden rounded-full">
            {indeterminate ? (
              <div className="press-barber h-full w-full" />
            ) : (
              <motion.div
                className="h-full rounded-full bg-[var(--accent)]"
                initial={{ width: 0 }}
                animate={{ width: `${Math.max(4, pct * 100)}%` }}
                transition={{ type: 'spring', stiffness: 120, damping: 20 }}
              />
            )}
          </div>
        </div>

        {/* Counters */}
        <div className="hidden shrink-0 text-right text-[10px] uppercase tracking-widest text-[var(--ink)]/60 sm:block">
          <div className="font-bold text-[var(--ink)]">
            {total > 0 ? `${done} / ${total}` : '—'} <span className="font-normal text-[var(--ink)]/55">pages</span>
          </div>
          <div className="text-[var(--ink)]/45">{takoCount} Tako {takoCount === 1 ? 'call' : 'calls'}</div>
        </div>
      </div>
    </motion.div>
  );
}
