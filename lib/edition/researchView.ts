/**
 * Per-bubble ownership logic for the research chat surface.
 *
 * Every Tako-backed action (askTako, addSection, replace*WithResearch, refreshChart)
 * shares ONE display surface in useEditionCopilot, because CopilotKit's render props
 * carry no per-call id. To stop one run's prose/sources/log from bleeding into another
 * bubble, each bubble *claims* exactly one monotonic `runId` (its own run) and shows
 * data only while the surface still carries that id — rendering title-only until it
 * claims. This reducer is pure so the rule can be unit-tested without React.
 *
 * The hook tags the surface with a fresh id at the START of each run (beginResearchRun)
 * and tracks which ids have already been claimed (a Set seeded with the pre-first-run
 * sentinel 0). A bubble may only claim once, only while its own handler is running
 * (`status === 'executing'`), and never an id another bubble already owns — so the
 * pre-handler window (when the surface still holds the previous run's content) renders
 * nothing.
 */
import type { TGraphic, TTableData } from '@/lib/schema';

/** A graphic this run produced, mirrored into the bubble (frozen with the rest on done). */
export type GraphicPreview = { graphic: TGraphic; table: TTableData; caption: string };

export type Snapshot = {
  lines: string[];
  sources: string[];
  answer: string;
  /** This run's terminal line (e.g. "Replaced …" / "Done."); '' while still streaming. */
  done: string;
  /** The graphic this run built, surfaced once it lands; null until/unless one exists. */
  graphic?: GraphicPreview | null;
  /** The section this run changed — drives the "↳ See it in …" jump link. Frozen with the
   *  rest of the snapshot so an old bubble always points at the section IT changed. */
  nav?: { slot: number; label: string } | null;
};
export type ResearchStatus = 'inProgress' | 'executing' | 'complete';

const EMPTY: Snapshot = { lines: [], sources: [], answer: '', done: '' };

export type ResearchViewState = {
  /** The surface id this bubble owns, or null until it claims one. */
  claimedRunId: number | null;
  /** The last surface snapshot seen while this bubble owned the surface. */
  lastOwn: Snapshot;
  /** Terminal capture — once set the bubble shows only this, immune to later runs. */
  frozen: Snapshot | null;
};

export type ResearchViewInput = {
  /** The surface's current run id. */
  runId: number;
  status: ResearchStatus;
  /** Live surface data (lines/sources/answer/done line) for `runId`. */
  live: Snapshot;
  /** This bubble has reached its terminal (status === 'complete'). */
  complete: boolean;
  /**
   * The surface itself already carries a terminal status line — i.e. it is the
   * leftover of a finished run, not a fresh one. A bubble must never claim such a
   * surface: that is the leftover the new bubble would otherwise display before its
   * own run begins.
   */
  surfaceDone: boolean;
  /** Some other bubble already claimed `runId` (or it is the seeded sentinel). */
  alreadyClaimed: boolean;
};

export const initResearchView = (): ResearchViewState => ({
  claimedRunId: null,
  lastOwn: EMPTY,
  frozen: null,
});

/**
 * Advance one bubble's view given the current surface. Returns the next state, what
 * the bubble should display (null → title-only), and whether it just claimed `runId`
 * (so the caller can record the claim in the shared set). Every transition is set-once
 * / idempotent, so re-running with the same input (React StrictMode) is a no-op.
 */
export function reduceResearchView(
  s: ResearchViewState,
  input: ResearchViewInput,
): { next: ResearchViewState; display: Snapshot | null; claim: boolean } {
  let { claimedRunId, lastOwn, frozen } = s;
  const { runId, status, live, complete, surfaceDone, alreadyClaimed } = input;

  // Claim only this bubble's OWN run: its handler is executing (so beginResearchRun has
  // re-tagged the surface to a FRESH run — surfaceDone is false), the id is unclaimed,
  // and this bubble has not itself completed. The surfaceDone guard is the decisive one:
  // a leftover surface from a finished run still carries its terminal line, so a new
  // bubble rendering during the pre-research window can never bind it.
  let claim = false;
  if (
    claimedRunId === null &&
    status === 'executing' &&
    !surfaceDone &&
    !alreadyClaimed &&
    !complete
  ) {
    claimedRunId = runId;
    claim = true;
  }

  const owns = claimedRunId !== null && runId === claimedRunId;

  // Keep our own latest copy while we hold the surface — so a later run that supersedes
  // us can never overwrite what we freeze.
  if (owns && frozen === null) lastOwn = live;

  // Freeze on completion: our live data if we still own the surface, else our last owned
  // copy (never a newer run's content).
  if (complete && frozen === null) frozen = owns ? live : lastOwn;

  // frozen > owned-live > (superseded) lastOwn > (never owned) nothing.
  const display: Snapshot | null = frozen
    ? frozen
    : owns
      ? live
      : claimedRunId === null
        ? null
        : lastOwn;

  return { next: { claimedRunId, lastOwn, frozen }, display, claim };
}
