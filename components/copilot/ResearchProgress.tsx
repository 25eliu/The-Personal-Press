'use client';
import { useEffect, useRef, useState } from 'react';
import {
  initResearchView,
  reduceResearchView,
  type GraphicPreview,
  type ResearchStatus,
  type Snapshot,
} from '@/lib/edition/researchView';
import { GraphicView } from '@/components/newspaper/GraphicView';

const EMPTY: Snapshot = { lines: [], sources: [], answer: '', done: '', graphic: null, nav: null };

/**
 * Live research surface inside a copilot chat bubble while a Tako-backed action runs
 * (askTako streams an answer token-by-token; addSection/refreshChart stream tool
 * activity). Shows what that run produces as it arrives: the answer prose (with a
 * blinking caret while streaming), the outlets being sourced (chips), a faint wire log
 * of the underlying tool calls, and finally its own terminal/explanation line.
 *
 * All research actions share ONE display surface in useEditionCopilot (CopilotKit's
 * render props carry no per-call id). To keep every result contained to its OWN chat
 * bubble, each research bubble claims exactly one monotonic `runId` (its own run) via
 * `reduceResearchView` and renders ONLY that run's data — answer, sources, log, AND the
 * terminal line — freezing the whole snapshot once it completes. It shows title-only
 * until it claims, so a fresh bubble can never display the previous run's leftovers, and
 * a finished bubble can never be overwritten by a later run. The `editArticle` bubble
 * passes no `runId` and keeps the simpler freeze-on-done path.
 *
 * In ownership mode `done` is the RAW surface terminal line (string | null); the bubble
 * decides — from its own claimed run and completion — whether/what to show. In legacy
 * mode `done` is the already-gated line to show (string | undefined).
 */
export function ResearchProgress({
  title,
  lines,
  sources = [],
  answer = '',
  done,
  graphic = null,
  nav = null,
  onNavigate,
  runId,
  status,
  surfaceDone,
  claimed,
}: {
  title: string;
  lines: string[];
  sources?: string[];
  answer?: string;
  done?: string | null;
  graphic?: GraphicPreview | null;
  /** The section this bubble changed (slot + printed label) — renders a jump link. */
  nav?: { slot: number; label: string } | null;
  /** Flip the reader to a section. Wired from DailyTako through the copilot. */
  onNavigate?: (slot: number) => void;
  runId?: number;
  status?: ResearchStatus;
  surfaceDone?: boolean;
  claimed?: Set<number>;
}) {
  // Legacy mode (editArticle): no shared surface → freeze the snapshot once on done.
  const [frozenLegacy, setFrozenLegacy] = useState<Snapshot | null>(null);

  // Ownership mode (research actions): thread the pure reducer through a ref so each
  // bubble shows only its own run's data. Mutating the ref during render mirrors the
  // freeze-during-render pattern and is idempotent (StrictMode-safe).
  const viewRef = useRef(initResearchView());
  const pendingClaim = useRef<number | null>(null);

  const ownership = runId !== undefined && status !== undefined && claimed !== undefined;

  let view: Snapshot;
  let complete: boolean; // this bubble has finished → no caret, show its terminal line
  let doneLine: string | undefined; // the terminal/explanation line to render, if any

  if (!ownership) {
    complete = Boolean(done);
    if (complete && frozenLegacy === null) {
      setFrozenLegacy({ lines, sources, answer, done: '', graphic, nav });
    }
    view = frozenLegacy ?? { lines, sources, answer, done: '', graphic, nav };
    doneLine = typeof done === 'string' && done ? done : undefined;
  } else {
    complete = status === 'complete';
    const { next, display, claim } = reduceResearchView(viewRef.current, {
      runId,
      status,
      live: { lines, sources, answer, done: typeof done === 'string' ? done : '', graphic, nav },
      complete,
      surfaceDone: Boolean(surfaceDone),
      alreadyClaimed: claimed.has(runId),
    });
    viewRef.current = next;
    if (claim) pendingClaim.current = runId;
    view = display ?? EMPTY;
    // Only a bubble that actually owned its run shows a terminal line — never a leaked
    // one. Its own line comes from the frozen snapshot; fall back to "Done." if it
    // produced content but no explicit line.
    const hasContent = Boolean(view.answer || view.sources.length || view.lines.length);
    doneLine = complete && (view.done || hasContent) ? view.done || 'Done.' : undefined;
  }

  // Record a claim in the shared set AFTER commit — never mutate shared state during
  // render. By the time another bubble renders (a later commit), the id is recorded.
  useEffect(() => {
    if (pendingClaim.current !== null && claimed) {
      claimed.add(pendingClaim.current);
      pendingClaim.current = null;
    }
  });

  return (
    <div className="font-mono-news my-1 rounded-sm border border-[var(--ink)]/30 bg-[var(--paper)] px-3 py-2 text-[11px] text-[var(--ink)] shadow-sm">
      <p className="mb-1.5 flex items-center gap-1.5 uppercase tracking-widest">
        {!complete && <span className="live-dot text-[var(--accent)]">●</span>}
        {title}
      </p>

      {/* Streamed answer prose — appears token-by-token, with a caret while live. */}
      {view.answer && (
        <p
          className="mb-2 whitespace-pre-wrap text-[12.5px] leading-snug text-[var(--ink)]"
          style={{ fontFamily: 'var(--font-body)' }}
        >
          {view.answer}
          {!complete && <span className="live-dot ml-0.5 text-[var(--accent)]">▍</span>}
        </p>
      )}

      {/* The graphic this run produced — the SAME component that lands in the paper,
          mirrored here so generation/revamp shows its figure as it commits. */}
      {view.graphic && (
        <div className="mb-2 overflow-x-auto">
          <GraphicView
            graphic={view.graphic.graphic}
            table={view.graphic.table}
            caption={view.graphic.caption}
            width={232}
            height={150}
          />
        </div>
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

      {doneLine && <p className="mt-1.5 font-bold text-[var(--accent)]">{doneLine}</p>}

      {/* Jump link — flip the reader to the section this bubble changed. Shows only once the
          run is complete and a navigation handler is wired. */}
      {complete && view.nav && onNavigate && (
        <button
          type="button"
          onClick={() => onNavigate(view.nav!.slot)}
          className="mt-1.5 inline-flex items-center gap-1 text-[11px] font-bold text-[var(--ink)]/70 underline-offset-2 transition-colors hover:text-[var(--accent)] hover:underline"
        >
          ↳ See it in “{view.nav.label}”
        </button>
      )}
    </div>
  );
}
