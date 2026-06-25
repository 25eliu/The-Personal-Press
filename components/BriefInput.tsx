'use client';
import { useState } from 'react';
import { motion } from 'framer-motion';

const EXAMPLES = [
  'AI startups, the Fed, and the Premier League',
  'crypto markets, SpaceX, and the NBA playoffs',
  'climate policy, oil prices, and the World Cup',
];

export function BriefInput({ initial, onSubmit }: { initial: string; onSubmit: (brief: string) => void }) {
  const [value, setValue] = useState(initial);

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
        <h1 className="font-masthead text-5xl leading-none text-[var(--ink)] md:text-7xl">The Daily Tako</h1>
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
          placeholder={EXAMPLES[0]}
          className="font-mono-news mt-3 w-full border-0 border-b-2 border-dashed border-[var(--ink)]/50 bg-transparent px-1 py-2 text-center text-lg text-[var(--ink)] placeholder:text-[var(--ink)]/35 focus:border-[var(--accent)] focus:outline-none"
        />
        <div className="mt-3 flex flex-wrap justify-center gap-2">
          {EXAMPLES.map((ex) => (
            <button
              key={ex}
              type="button"
              onClick={() => setValue(ex)}
              className="font-mono-news rounded-full border border-[var(--ink)]/30 px-2.5 py-0.5 text-[10px] text-[var(--ink)]/60 transition-colors hover:border-[var(--accent)] hover:text-[var(--accent)]"
            >
              {ex}
            </button>
          ))}
        </div>
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
