'use client';
export function BWToggle({ bw, onToggle }: { bw: boolean; onToggle: () => void }) {
  return (
    <button
      onClick={onToggle}
      className="font-mono-news rounded-full border border-[#f4efe2]/50 px-3 py-1 text-xs uppercase tracking-widest text-[#f4efe2] hover:bg-[#f4efe2]/10"
      title="Toggle color"
    >
      {bw ? '◑ No Color' : '◐ Color'}
    </button>
  );
}
