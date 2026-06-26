'use client';
import { AnimatePresence, motion } from 'framer-motion';

/** A line on the wire: a real Tako tool call ('tako') or a sarcastic quip ('quip'). */
export type ActivityItem = {
  id: number;
  kind: 'tako' | 'quip';
  slot?: number;
  topic?: string;
  label: string;
  detail?: string;
};

/**
 * A newsroom "wire" ticker that announces each Tako tool call as the agents
 * work — e.g. "USING TAKO SEARCH — 'Fed interest rate'". Newest dispatch on top.
 */
export function WireTicker({ items }: { items: ActivityItem[] }) {
  const latest = items.length > 0 ? items[items.length - 1] : null;
  const takoCount = items.filter((i) => i.kind === 'tako').length;
  return (
    <div className="ticker font-mono-news w-full max-w-[1560px] overflow-hidden rounded-sm border border-black/70 shadow-lg">
      <div className="flex h-10 items-stretch">
        <div className="flex shrink-0 items-center gap-2 bg-[var(--accent)] px-3 text-[11px] font-bold uppercase tracking-[0.2em] text-[var(--paper)]">
          <span className="live-dot">●</span>
          <span className="hidden sm:inline">Tako Wire</span>
        </div>
        <div className="relative flex flex-1 items-center overflow-hidden px-3 text-[11px] text-[var(--paper)]">
          <AnimatePresence initial={false} mode="wait">
            {latest ? (
              <motion.div
                key={latest.id}
                initial={{ opacity: 0, y: -12 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 12 }}
                transition={{ duration: 0.22 }}
                className="w-full truncate"
              >
                {latest.kind === 'quip' ? (
                  <span className="italic opacity-90">🐙 {latest.label}</span>
                ) : (
                  <>
                    <span className="font-bold uppercase tracking-wide">{latest.label}</span>
                    {latest.detail && <span className="opacity-80"> — “{latest.detail}”</span>}
                    {latest.topic && <span className="opacity-50"> · {latest.topic}</span>}
                  </>
                )}
              </motion.div>
            ) : (
              <motion.span key="idle" initial={{ opacity: 0 }} animate={{ opacity: 0.6 }} className="truncate">
                Awaiting dispatches from the newsroom…
              </motion.span>
            )}
          </AnimatePresence>
        </div>
        <div className="hidden shrink-0 items-center gap-2 px-3 text-[10px] uppercase tracking-widest text-[var(--paper)]/50 sm:flex">
          {takoCount > 0 && <span className="text-[var(--paper)]/70">{takoCount} Tako calls</span>}
          Powered by Tako
        </div>
      </div>
    </div>
  );
}
