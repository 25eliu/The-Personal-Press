'use client';
import { useState } from 'react';

export function BriefInput({ initial, onSubmit }: { initial: string; onSubmit: (brief: string) => void }) {
  const [value, setValue] = useState(initial);
  return (
    <form
      onSubmit={(e) => { e.preventDefault(); if (value.trim()) onSubmit(value.trim()); }}
      className="flex w-full max-w-2xl flex-col items-center gap-4"
    >
      <h1 className="font-masthead text-5xl text-[#f4efe2] md:text-7xl">The Daily Tako</h1>
      <p className="text-center text-sm text-[#f4efe2]/70">What would you like your newspaper to be about?</p>
      <input
        autoFocus
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder="AI startups, the Fed, and the Premier League"
        className="w-full rounded border border-[#f4efe2]/40 bg-transparent px-4 py-3 text-center text-lg text-[#f4efe2] placeholder:text-[#f4efe2]/40 focus:outline-none"
      />
      <button type="submit" className="rounded bg-[#f4efe2] px-6 py-2 font-head font-bold text-[#14110d]">
        Print my paper
      </button>
    </form>
  );
}
