'use client';
import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { getDailyBriefs } from '@/lib/edition/examples';
import { loadDailyBriefs } from '@/lib/edition/dailyBriefs';

// Skeleton pill widths while today's wire is pulled — varied so it reads as headlines.
const SKELETON_WIDTHS = [116, 138, 96, 124];

export function BriefInput({ initial, onSubmit }: { initial: string; onSubmit: (brief: string) => void }) {
  const [value, setValue] = useState(initial);
  // null = still pulling today's current-event briefs (shows the shimmer below).
  const [examples, setExamples] = useState<string[] | null>(null);

  useEffect(() => {
    const ac = new AbortController();
    let live = true;
    // Always hold the shimmer for a short beat — even when today's set is already cached
    // — so it reads as "pulling today's wire", then resolves quickly.
    const buffer = new Promise((r) => setTimeout(r, 600));
    Promise.all([loadDailyBriefs(ac.signal), buffer])
      .then(([briefs]) => { if (live) setExamples(briefs); })
      .catch(() => { if (live) setExamples(getDailyBriefs()); });
    return () => { live = false; ac.abort(); };
  }, []);

  return (
    <motion.form
      initial={{ opacity: 0, y: 24, rotate: -1.2 }}
      animate={{ opacity: 1, y: 0, rotate: -1.2 }}
      transition={{ duration: 0.6, ease: 'easeOut' }}
      onSubmit={(e) => { e.preventDefault(); if (value.trim()) onSubmit(value.trim()); }}
      className="flex w-full max-w-2xl flex-col items-stretch gap-5"
    >
      {/* Nameplate resting on the desk */}
      <div className="nameplate px-6 py-5 text-center">
        <div className="mb-2 flex items-center justify-between border-b border-[var(--ink)] pb-1 text-[10px] uppercase tracking-[0.25em] text-[var(--ink)]/70">
          <span>Est. 2026</span>
          <span className="font-mono-news hidden sm:inline">Powered by Tako</span>
          <span>Price: Free</span>
        </div>
        <h1 className="font-masthead text-5xl leading-none text-[var(--ink)] md:text-7xl">The Personal Press</h1>
        <p className="mt-2 border-t-2 border-[var(--ink)] pt-1 font-head text-sm italic text-[var(--ink)]/80">
          All the data that&rsquo;s fit to print &mdash; reported live by an AI newsroom
        </p>
      </div>

      {/* Typewriter slip — the assignment desk */}
      <motion.div
        initial={{ rotate: 1 }}
        animate={{ rotate: 1 }}
        className="paper-slip px-5 py-5"
      >
        <label htmlFor="brief" className="font-mono-news block text-center text-[11px] uppercase tracking-[0.2em] text-[var(--ink)]/70">
          What should today&rsquo;s edition cover?
        </label>
        <input
          id="brief"
          autoFocus
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder={(examples ?? getDailyBriefs())[0]}
          className="font-mono-news mt-3 w-full border-0 border-b-2 border-dashed border-[var(--ink)]/50 bg-transparent px-1 py-2 text-center text-lg text-[var(--ink)] placeholder:text-[var(--ink)]/35 focus:border-[var(--accent)] focus:outline-none"
        />
        {examples === null ? (
          <div className="mt-3 flex flex-col items-center gap-2">
            <span className="font-mono-news flex items-center gap-1.5 text-[9px] uppercase tracking-[0.22em] text-[var(--ink)]/45">
              <span className="live-dot text-[var(--accent)]">●</span> Pulling today&rsquo;s wire
            </span>
            <div className="flex flex-wrap justify-center gap-2">
              {SKELETON_WIDTHS.slice(0, 3).map((w, i) => (
                <span
                  key={i}
                  className="h-[23px] animate-pulse rounded-full border border-[var(--ink)]/15 bg-[var(--ink)]/10"
                  style={{ width: w, animationDelay: `${i * 140}ms` }}
                />
              ))}
            </div>
          </div>
        ) : (
          <motion.div
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.35, ease: 'easeOut' }}
            className="mt-3 flex flex-wrap justify-center gap-2"
          >
            {examples.map((ex) => (
              <button
                key={ex}
                type="button"
                onClick={() => setValue(ex)}
                className="font-mono-news rounded-full border border-[var(--ink)]/30 px-2.5 py-0.5 text-[10px] text-[var(--ink)]/60 transition-colors hover:border-[var(--accent)] hover:text-[var(--accent)]"
              >
                {ex}
              </button>
            ))}
          </motion.div>
        )}
        <button
          type="submit"
          disabled={!value.trim()}
          className="font-head mt-4 w-full rounded-sm border-2 border-[var(--ink)] bg-[var(--accent)] px-6 py-2.5 text-base font-black uppercase tracking-widest text-[var(--paper)] shadow-[3px_3px_0_var(--ink)] transition-transform hover:-translate-y-0.5 active:translate-y-0 disabled:cursor-not-allowed disabled:opacity-50 disabled:shadow-none"
        >
          ⨋ Set the type &amp; print
        </button>
      </motion.div>
    </motion.form>
  );
}
