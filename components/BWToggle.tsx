'use client';
export function BWToggle({ bw, onToggle }: { bw: boolean; onToggle: () => void }) {
  return (
    <button
      onClick={onToggle}
      className="font-mono-news rounded-full border border-[var(--ink)]/40 bg-[var(--paper)]/85 px-3 py-1 text-xs uppercase tracking-widest text-[var(--ink)] shadow-sm transition-colors hover:bg-[var(--paper)]"
      title="Toggle color"
    >
      {bw ? '◑ No Color' : '◐ Color'}
    </button>
  );
}
