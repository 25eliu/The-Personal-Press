'use client';
import { useState } from 'react';

type Snapshot = { lines: string[]; sources: string[]; answer: string };

/**
 * Live research surface inside a copilot chat bubble while a Tako-backed action runs
 * (askTako streams an answer token-by-token; addSection/refreshChart stream tool
 * activity). Shows three things as they arrive: the answer prose (with a blinking
 * caret while streaming), the specific outlets being sourced (chips), and a faint
 * wire log of the underlying tool calls.
 *
 * The progress state is shared across actions (only one runs at a time), so a
 * finished bubble freezes its snapshot the moment it completes — otherwise a later
 * action's activity would bleed into an earlier, already-done message.
 */
export function ResearchProgress({
  title,
  lines,
  sources = [],
  answer = '',
  done,
}: {
  title: string;
  lines: string[];
  sources?: string[];
  answer?: string;
  done?: string;
}) {
  // Freeze the whole snapshot the moment this bubble completes. Adjusting state
  // during render (guarded so it runs once) is React's sanctioned alternative to an
  // effect here — it avoids a later action's activity bleeding into this message.
  const [frozen, setFrozen] = useState<Snapshot | null>(null);
  if (done && frozen === null) setFrozen({ lines, sources, answer });
  const shown = frozen ?? { lines, sources, answer };

  return (
    <div className="font-mono-news my-1 rounded-sm border border-[var(--ink)]/30 bg-[var(--paper)] px-3 py-2 text-[11px] text-[var(--ink)] shadow-sm">
      <p className="mb-1.5 flex items-center gap-1.5 uppercase tracking-widest">
        {!done && <span className="live-dot text-[var(--accent)]">●</span>}
        {title}
      </p>

      {/* Streamed answer prose — appears token-by-token, with a caret while live. */}
      {shown.answer && (
        <p
          className="mb-2 whitespace-pre-wrap text-[12.5px] leading-snug text-[var(--ink)]"
          style={{ fontFamily: 'var(--font-body)' }}
        >
          {shown.answer}
          {!done && <span className="live-dot ml-0.5 text-[var(--accent)]">▍</span>}
        </p>
      )}

      {/* The specific outlets being pulled from — the heart of "show me your sources". */}
      {shown.sources.length > 0 && (
        <div className="mb-1.5">
          <p className="mb-1 text-[9px] uppercase tracking-[0.18em] text-[var(--ink)]/45">
            Sourced from
          </p>
          <ul className="flex flex-wrap gap-1">
            {shown.sources.map((s, i) => (
              <li
                key={`${s}-${i}`}
                className="rounded-sm border border-[var(--accent)]/45 bg-[var(--accent)]/8 px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-[var(--accent)]"
              >
                {s}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Faint wire log of the underlying tool calls. */}
      {shown.lines.length > 0 && (
        <ul className="space-y-0.5">
          {shown.lines.map((l, i) => (
            <li key={i} className="truncate text-[var(--ink)]/55">
              {l}
            </li>
          ))}
        </ul>
      )}

      {done && <p className="mt-1.5 font-bold text-[var(--accent)]">{done}</p>}
    </div>
  );
}
