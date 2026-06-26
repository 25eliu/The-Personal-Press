'use client';
import { useEffect, useRef, useState } from 'react';
import {
  initResearchView,
  reduceResearchView,
  type ResearchStatus,
  type Snapshot,
} from '@/lib/edition/researchView';

const EMPTY: Snapshot = { lines: [], sources: [], answer: '' };

/**
 * Live research surface inside a copilot chat bubble while a Tako-backed action runs
 * (askTako streams an answer token-by-token; addSection/refreshChart stream tool
 * activity). Shows three things as they arrive: the answer prose (with a blinking
 * caret while streaming), the specific outlets being sourced (chips), and a faint
 * wire log of the underlying tool calls.
 *
 * All research actions share ONE display surface in useEditionCopilot (CopilotKit's
 * render props carry no per-call id). To stop one run's content from bleeding into
 * another bubble, each research bubble claims exactly one monotonic `runId` (its own
 * run) and renders data only while the surface still carries that id — see
 * `reduceResearchView`. It shows title-only until it claims, so the pre-handler window
 * (when the surface still holds the previous run's content) never leaks. The
 * `editArticle` bubble passes no `runId` and keeps the simpler freeze-on-done path.
 */
export function ResearchProgress({
  title,
  lines,
  sources = [],
  answer = '',
  done,
  runId,
  status,
  claimed,
}: {
  title: string;
  lines: string[];
  sources?: string[];
  answer?: string;
  done?: string;
  runId?: number;
  status?: ResearchStatus;
  claimed?: Set<number>;
}) {
  // Legacy mode (editArticle): no shared surface → freeze the snapshot once on done.
  const [frozenLegacy, setFrozenLegacy] = useState<Snapshot | null>(null);

  // Ownership mode (research actions): thread the pure reducer through a ref so each
  // bubble shows only its own run's data. Mutating the ref during render mirrors the
  // freeze-during-render pattern below and is idempotent (StrictMode-safe).
  const viewRef = useRef(initResearchView());
  const pendingClaim = useRef<number | null>(null);

  let shown: Snapshot | null;
  if (runId === undefined || status === undefined || claimed === undefined) {
    if (done && frozenLegacy === null) setFrozenLegacy({ lines, sources, answer });
    shown = frozenLegacy ?? { lines, sources, answer };
  } else {
    const { next, display, claim } = reduceResearchView(viewRef.current, {
      runId,
      status,
      live: { lines, sources, answer },
      done: Boolean(done),
      alreadyClaimed: claimed.has(runId),
    });
    viewRef.current = next;
    if (claim) pendingClaim.current = runId;
    shown = display;
  }

  // Record a claim in the shared set AFTER commit — never mutate shared state during
  // render. By the time another bubble renders (a later commit), the id is recorded.
  useEffect(() => {
    if (pendingClaim.current !== null && claimed) {
      claimed.add(pendingClaim.current);
      pendingClaim.current = null;
    }
  });

  const view = shown ?? EMPTY;

  return (
    <div className="font-mono-news my-1 rounded-sm border border-[var(--ink)]/30 bg-[var(--paper)] px-3 py-2 text-[11px] text-[var(--ink)] shadow-sm">
      <p className="mb-1.5 flex items-center gap-1.5 uppercase tracking-widest">
        {!done && <span className="live-dot text-[var(--accent)]">●</span>}
        {title}
      </p>

      {/* Streamed answer prose — appears token-by-token, with a caret while live. */}
      {view.answer && (
        <p
          className="mb-2 whitespace-pre-wrap text-[12.5px] leading-snug text-[var(--ink)]"
          style={{ fontFamily: 'var(--font-body)' }}
        >
          {view.answer}
          {!done && <span className="live-dot ml-0.5 text-[var(--accent)]">▍</span>}
        </p>
      )}

      {/* The specific outlets being pulled from — the heart of "show me your sources". */}
      {view.sources.length > 0 && (
        <div className="mb-1.5">
          <p className="mb-1 text-[9px] uppercase tracking-[0.18em] text-[var(--ink)]/45">
            Sourced from
          </p>
          <ul className="flex flex-wrap gap-1">
            {view.sources.map((s, i) => (
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
      {view.lines.length > 0 && (
        <ul className="space-y-0.5">
          {view.lines.map((l, i) => (
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
