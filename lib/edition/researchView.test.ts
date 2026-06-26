import { expect, test } from 'vitest';
import {
  initResearchView,
  reduceResearchView,
  type ResearchStatus,
  type ResearchViewState,
  type Snapshot,
} from '@/lib/edition/researchView';

// A bubble = its own reducer state. Bubbles share one claim-set (seeded with the
// pre-first-run sentinel 0), exactly like ResearchProgress + the hook's useRef<Set>.
class Bubble {
  state: ResearchViewState = initResearchView();
  constructor(private claimed: Set<number>) {}
  // One render: compute alreadyClaimed from the shared set, reduce, record any claim.
  render(runId: number, status: ResearchStatus, live: Snapshot, done = false): Snapshot | null {
    const { next, display, claim } = reduceResearchView(this.state, {
      runId,
      status,
      live,
      done,
      alreadyClaimed: this.claimed.has(runId),
    });
    this.state = next;
    if (claim) this.claimed.add(runId);
    return display;
  }
}

const snap = (answer: string, sources: string[] = [], lines: string[] = []): Snapshot => ({
  answer,
  sources,
  lines,
});
const NBA = snap('Knicks win the title', ['nbcnews.com'], ['Tako: NBA Finals 2026']);
const POLITICS = snap('Senate passes the bill', ['reuters.com'], ['Tako: politics 2026']);

test('the repro: a fresh bubble never shows the previous run’s content', () => {
  const claimed = new Set([0]);

  // Run 1 (NBA): bubble A claims id 1 and streams to completion.
  const a = new Bubble(claimed);
  expect(a.render(0, 'inProgress', snap(''))).toBeNull(); // pre-handler: title-only
  a.render(1, 'executing', snap('')); // beginResearchRun minted 1 → claim
  expect(a.render(1, 'executing', NBA)).toEqual(NBA); // streams its own data
  expect(a.render(1, 'complete', NBA, true)).toEqual(NBA); // frozen

  // Surface now idles on run 1's NBA content. Run 2 (politics): bubble B.
  const b = new Bubble(claimed);
  // Pre-handler window: surface still carries NBA under id 1 → B must show NOTHING.
  expect(b.render(1, 'inProgress', NBA)).toBeNull();
  expect(b.render(1, 'executing', NBA)).toBeNull(); // id 1 already claimed by A → no leak
  // Handler runs beginResearchRun → fresh id 2, empty surface.
  b.render(2, 'executing', snap(''));
  expect(b.render(2, 'executing', POLITICS)).toEqual(POLITICS); // its own data
  expect(b.render(2, 'complete', POLITICS, true)).toEqual(POLITICS);

  // A stays frozen on NBA even as B's run advances the surface.
  expect(a.render(2, 'complete', POLITICS, true)).toEqual(NBA);
});

test('supersede: a cancelled run freezes its own data, not the newer run’s', () => {
  const claimed = new Set([0]);
  const a = new Bubble(claimed);
  a.render(1, 'executing', snap(''));
  expect(a.render(1, 'executing', NBA)).toEqual(NBA); // owns + streaming

  // Run 2 begins (abort): surface jumps to id 2 while A is still 'executing'.
  expect(a.render(2, 'executing', POLITICS)).toEqual(NBA); // shows its last owned copy
  // A finally completes — must freeze NBA (its own), never POLITICS.
  expect(a.render(2, 'complete', POLITICS, true)).toEqual(NBA);
});

test('no blank on completion: the frame done flips while still owning shows full answer', () => {
  const claimed = new Set([0]);
  const a = new Bubble(claimed);
  a.render(1, 'executing', snap(''));
  a.render(1, 'executing', NBA);
  expect(a.render(1, 'complete', NBA, true)).toEqual(NBA);
});

test('first action ever: the seeded sentinel keeps the bubble off the initial surface', () => {
  const claimed = new Set([0]);
  const a = new Bubble(claimed);
  // Pre-handler render sees the initial surface id 0 (seeded as claimed) → no claim.
  expect(a.render(0, 'executing', snap(''))).toBeNull();
  a.render(1, 'executing', snap('')); // beginResearchRun → id 1, claimed
  expect(a.render(1, 'executing', NBA)).toEqual(NBA);
});

test('bubble that never reaches executing stays title-only (degrades, never wrong)', () => {
  const claimed = new Set([0]);
  const b = new Bubble(claimed);
  expect(b.render(1, 'inProgress', NBA)).toBeNull();
  // Never owned the surface → freezes empty: no answer/sources/log (title-only), and
  // crucially never the NBA content it was shown.
  expect(b.render(1, 'complete', NBA, true)).toEqual({ lines: [], sources: [], answer: '' });
});

test('idempotent: re-applying the same input does not change state or display', () => {
  const claimed = new Set([0]);
  const a = new Bubble(claimed);
  a.render(1, 'executing', snap(''));
  const first = a.render(1, 'executing', NBA);
  const stateAfter = a.state;
  const second = a.render(1, 'executing', NBA);
  expect(second).toEqual(first);
  expect(a.state).toEqual(stateAfter);
  expect([...claimed]).toEqual([0, 1]); // claimed only once
});
