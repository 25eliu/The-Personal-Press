'use client';
import { useEffect, useReducer, useRef, useState } from 'react';
import type { GenerateEvent } from '@/lib/stream/events';
import type { TNewspaper } from '@/lib/schema';
import { streamGenerate } from '@/lib/stream/client';
import { editionReducer, initialEditionState } from '@/lib/edition/state';
import { isSuggestedBrief } from '@/lib/edition/dailyBriefs';
import { getCachedEdition, setCachedEdition } from '@/lib/edition/exampleCache';
import { replayCachedEdition } from '@/lib/edition/replayCache';
import { playDemo } from '@/lib/demo/sample';
import { BriefInput } from '@/components/BriefInput';
import { BWToggle } from '@/components/BWToggle';
import { WireTicker, type ActivityItem } from '@/components/build/WireTicker';
import { BuildStatus, type BuildStage } from '@/components/build/BuildStatus';
import { NewspaperView } from '@/components/newspaper/NewspaperView';
import { CopilotKit } from '@copilotkit/react-core';
import { CopilotBridge } from '@/components/copilot/CopilotBridge';
import { LiveEditProvider } from '@/lib/edition/liveEdit';

type Phase = 'idle' | 'typesetting' | 'printing' | 'reading';

// Sarcastic newsroom quips mixed into the wire while the agents work.
const QUIPS = [
  'Consulting the octopus for a second opinion.',
  'Fact-checker located; mild panic ensues.',
  'Headline desk arguing about an Oxford comma.',
  'Bribing the typesetter with biscuits.',
  'Editor insists every chart “needs more drama.”',
  'Markets desk whispering sweet nothings to a spreadsheet.',
  'Sports desk still litigating that offside call.',
  'Printing press warming up, demanding overtime.',
  'Intern dispatched for more coffee. Again.',
  'Wire desk: “this just in, and it’s mildly interesting.”',
  'Polishing a pull-quote nobody asked for.',
  'Ink levels: dramatic. Deadlines: more dramatic.',
];

export function DailyTako() {
  const [phase, setPhase] = useState<Phase>('idle');
  // Color is the default house style; readers opt into the timeless no-color mode.
  const [bw, setBw] = useState(false);
  const [brief, setBrief] = useState('');
  const [edition, dispatch] = useReducer(editionReducer, initialEditionState);
  const { meta, plan, pages } = edition;
  const [activity, setActivity] = useState<ActivityItem[]>([]);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const activityId = useRef(0);
  // The user's explicit Copy Desk toggle, or null before they've touched it.
  // Derived `deskOpen` below: open while reading unless the reader closed it.
  // Kept as an override (not a synced effect) so no setState-in-effect is needed.
  const [deskToggle, setDeskToggle] = useState<boolean | null>(null);

  const building = phase === 'typesetting' || phase === 'printing';
  // The desk is only present while reading; it auto-opens (defaultOpen) unless the
  // reader has closed it. This drives the press floor sliding left to make room.
  const deskOpen = phase === 'reading' && (deskToggle ?? true);
  // How the press floor reserves the Copy Desk's horizontal space. The reserve total
  // is the SAME while loading and reading, so the spread's size never changes — only
  // its position: centred while printing ('loading'), shifted left once the desk
  // reveals ('desk-open'). Closing the desk releases the reserve ('full').
  const floorState: 'idle' | 'loading' | 'desk-open' | 'full' =
    phase === 'idle' ? 'idle' : building ? 'loading' : deskOpen ? 'desk-open' : 'full';

  // Plain-language build telemetry for the press console.
  const pagesTotal = plan.length;
  const pagesDone = pages.filter(Boolean).length;
  const takoCount = activity.filter((a) => a.kind === 'tako').length;
  const stage: BuildStage =
    phase === 'printing' ? 'printing' : pagesTotal === 0 ? 'planning' : 'typesetting';

  useEffect(() => {
    setBw(localStorage.getItem('tako-bw') === 'true');
    setBrief(localStorage.getItem('tako-brief') ?? '');
  }, []);

  useEffect(() => () => abortRef.current?.abort(), []);

  // Drip sarcastic quips onto the wire while building.
  useEffect(() => {
    if (!building) return;
    const id = setInterval(() => {
      setActivity((prev) => [
        ...prev,
        { id: activityId.current++, kind: 'quip', label: QUIPS[Math.floor(Math.random() * QUIPS.length)] },
      ]);
    }, 3400);
    return () => clearInterval(id);
  }, [building]);

  function toggleBw() {
    setBw((prev) => { localStorage.setItem('tako-bw', String(!prev)); return !prev; });
  }

  function onEvent(e: GenerateEvent) {
    if (e.type === 'editor_done') {
      dispatch({
        type: 'SET_FROM_EDITOR',
        meta: { masthead: e.masthead, tagline: e.tagline, edition: e.edition, dateLine: e.dateLine },
        plan: e.plan,
      });
    } else if (e.type === 'tool_activity') {
      setActivity((prev) => [
        ...prev,
        { id: activityId.current++, kind: 'tako', slot: e.slot, topic: e.topic, label: e.label, detail: e.detail, sources: e.sources },
      ]);
    } else if (e.type === 'section_done') {
      dispatch({ type: 'SET_SECTION', slot: e.slot, page: e.page });
    } else if (e.type === 'complete') {
      // Rebuild from the finished paper so dropped "no fresh reporting" sections
      // disappear from the spreads and section nav.
      dispatch({ type: 'COMPLETE', newspaper: e.newspaper });
      setPhase('printing');
      setTimeout(() => setPhase('reading'), 900);
    } else if (e.type === 'error') {
      setError(e.message);
    }
  }

  function resetForRun() {
    abortRef.current?.abort();
    dispatch({ type: 'RESET' });
    setError(null); setActivity([]); setPhase('typesetting'); setDeskToggle(null);
    abortRef.current = new AbortController();
    return abortRef.current.signal;
  }

  // Replay a cached example edition with no API calls — but route it through the SAME
  // live-build animation as a fresh run, just compressed. So a cached example still shows
  // the wire ticker and press progress as a brief loading buffer before the paper lands.
  async function replayCached(b: string, newspaper: TNewspaper) {
    const signal = resetForRun();
    localStorage.setItem('tako-brief', b);
    setBrief(b);
    await replayCachedEdition(newspaper, onEvent, () => signal.aborted);
  }

  async function start(b: string) {
    // Suggested example briefs are cached: replay instantly if we have a fresh one,
    // otherwise generate once and cache the result for next time.
    const cached = isSuggestedBrief(b) ? getCachedEdition(b) : null;
    if (cached) {
      await replayCached(b, cached);
      return;
    }
    const signal = resetForRun();
    localStorage.setItem('tako-brief', b);
    setBrief(b);
    let finalPaper: TNewspaper | null = null;
    try {
      await streamGenerate(b, (e) => { if (e.type === 'complete') finalPaper = e.newspaper; onEvent(e); }, signal);
      if (finalPaper && isSuggestedBrief(b)) setCachedEdition(b, finalPaper);
    } catch (err) {
      if (!(err instanceof DOMException && err.name === 'AbortError')) {
        setError(err instanceof Error ? err.message : 'Something went wrong.');
      }
    }
  }

  async function startDemo() {
    const signal = resetForRun();
    await playDemo(onEvent, () => signal.aborted);
  }

  return (
    <main
      // Remount at the idle↔build boundary so the reserved gutter is present from the
      // FIRST printed frame instead of easing in via the padding transition (which read
      // as a brief shrink on load). Within a run the key is stable, so closing the desk
      // while reading still animates the floor expanding.
      key={phase === 'idle' ? 'idle' : 'press'}
      className="press-floor relative flex min-h-screen flex-col items-center gap-4 p-5"
      data-floor-state={floorState}
    >
      {/* Very light scrim so cream pages pop without hiding the desk. */}
      {phase !== 'idle' && <div className="fixed inset-0 -z-10 bg-black/10" />}

      {phase !== 'idle' && (
        <div className="flex w-full max-w-[1560px] items-center justify-between">
          <button
            onClick={() => { abortRef.current?.abort(); setPhase('idle'); }}
            className="font-mono-news rounded-sm border border-[var(--ink)]/40 bg-[var(--paper)]/85 px-2.5 py-1 text-xs uppercase tracking-widest text-[var(--ink)] shadow-sm transition-colors hover:bg-[var(--paper)]"
          >
            ← New paper
          </button>
          <BWToggle bw={bw} onToggle={toggleBw} />
        </div>
      )}

      {error && (
        <p className="font-mono-news rounded-sm border border-[var(--accent)]/60 bg-black/70 px-4 py-2 text-sm text-[var(--paper)]">
          ⚠ {error}
        </p>
      )}

      {phase === 'idle' && (
        <div className="flex min-h-[78vh] w-full flex-col items-center justify-center gap-4">
          <BriefInput initial={brief} onSubmit={start} />
          <button
            onClick={startDemo}
            className="font-mono-news text-[11px] uppercase tracking-[0.2em] text-[#f4efe2]/80 underline-offset-4 drop-shadow transition-colors hover:text-[#f4efe2] hover:underline"
          >
            ▸ Preview a sample edition (no API key)
          </button>
        </div>
      )}

      {phase !== 'idle' && (
        <LiveEditProvider>
        <CopilotKit runtimeUrl="/api/copilotkit" showDevConsole={false}>
          {building && (
            <div className="flex w-full max-w-[1560px] flex-col items-center gap-2">
              <WireTicker items={activity} />
              <BuildStatus
                stage={stage}
                done={pagesDone}
                total={pagesTotal}
                takoCount={takoCount}
                masthead={meta.masthead}
                dateLine={meta.dateLine}
                brief={brief}
              />
            </div>
          )}
          <NewspaperView plan={plan} pages={pages} meta={meta} building={building} bw={bw} />
          {/* Editing only once the paper has finished printing, so edits can't race
              the generation stream's dispatches into the same reducer. */}
          <CopilotBridge
            edition={edition}
            dispatch={dispatch}
            abortRef={abortRef}
            showSidebar={phase === 'reading'}
            onOpenChange={setDeskToggle}
          />
        </CopilotKit>
        </LiveEditProvider>
      )}
    </main>
  );
}
