'use client';
import dynamic from 'next/dynamic';
import { useEffect, useRef, useState } from 'react';
import type { TNewspaper, TPage } from '@/lib/schema';
import type { GenerateEvent, SectionPlanItem } from '@/lib/stream/events';
import { streamGenerate } from '@/lib/stream/client';
import { playDemo } from '@/lib/demo/sample';
import { BriefInput } from '@/components/BriefInput';
import { BWToggle } from '@/components/BWToggle';
import { TypesettingStage } from '@/components/build/TypesettingStage';
import type { ActivityItem } from '@/components/build/WireTicker';

const PageFlipReader = dynamic(() => import('@/components/flip/PageFlipReader'), { ssr: false });

type Phase = 'idle' | 'typesetting' | 'printing' | 'reading';
type Meta = { masthead: string; tagline: string; edition: string; dateLine: string };
const EMPTY_META: Meta = { masthead: 'The Daily Tako', tagline: '', edition: '', dateLine: '' };

export function DailyTako() {
  const [phase, setPhase] = useState<Phase>('idle');
  const [bw, setBw] = useState(true);
  const [brief, setBrief] = useState('');
  const [meta, setMeta] = useState<Meta>(EMPTY_META);
  const [plan, setPlan] = useState<SectionPlanItem[]>([]);
  const [pages, setPages] = useState<(TPage | null)[]>([]);
  const [newspaper, setNewspaper] = useState<TNewspaper | null>(null);
  const [activity, setActivity] = useState<ActivityItem[]>([]);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const activityId = useRef(0);

  useEffect(() => {
    setBw(localStorage.getItem('tako-bw') !== 'false');
    setBrief(localStorage.getItem('tako-brief') ?? '');
  }, []);

  function toggleBw() {
    setBw((prev) => { localStorage.setItem('tako-bw', String(!prev)); return !prev; });
  }

  function onEvent(e: GenerateEvent) {
    if (e.type === 'editor_done') {
      setMeta({ masthead: e.masthead, tagline: e.tagline, edition: e.edition, dateLine: e.dateLine });
      setPlan(e.plan);
      setPages(new Array(e.plan.length).fill(null));
    } else if (e.type === 'tool_activity') {
      const item: ActivityItem = {
        id: activityId.current++, slot: e.slot, topic: e.topic, label: e.label, detail: e.detail,
      };
      setActivity((prev) => [...prev, item]);
    } else if (e.type === 'section_done') {
      setPages((prev) => { const next = [...prev]; next[e.slot] = e.page; return next; });
    } else if (e.type === 'complete') {
      setNewspaper(e.newspaper);
      setPhase('printing');
      setTimeout(() => setPhase('reading'), 900);
    } else if (e.type === 'error') {
      setError(e.message);
    }
  }

  useEffect(() => () => abortRef.current?.abort(), []);

  function resetForRun() {
    abortRef.current?.abort();
    setError(null); setNewspaper(null); setPlan([]); setPages([]); setActivity([]); setPhase('typesetting');
    abortRef.current = new AbortController();
    return abortRef.current.signal;
  }

  async function start(b: string) {
    const signal = resetForRun();
    localStorage.setItem('tako-brief', b);
    setBrief(b);
    try {
      await streamGenerate(b, onEvent, signal);
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
    <main className="relative flex min-h-screen flex-col items-center gap-6 p-6">
      {/* Dim the desk so the cream pages pop during build + reading. */}
      {phase !== 'idle' && <div className="fixed inset-0 -z-10 bg-black/55 backdrop-blur-[1px]" />}

      {phase !== 'idle' && (
        <div className="flex w-full max-w-6xl items-center justify-between">
          <button onClick={() => { abortRef.current?.abort(); setPhase('idle'); }} className="font-mono-news text-xs uppercase tracking-widest text-[#f4efe2]/70 transition-colors hover:text-[#f4efe2]">
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
            className="font-mono-news text-[11px] uppercase tracking-[0.2em] text-[#f4efe2]/75 underline-offset-4 transition-colors hover:text-[#f4efe2] hover:underline"
          >
            ▸ Preview a sample edition (no API key)
          </button>
        </div>
      )}

      {(phase === 'typesetting' || phase === 'printing') && (
        <div className={bw ? 'bw w-full flex justify-center' : 'w-full flex justify-center'}>
          <TypesettingStage
            plan={plan} pages={pages} activity={activity}
            masthead={meta.masthead} tagline={meta.tagline} edition={meta.edition} dateLine={meta.dateLine}
            printed={phase === 'printing'}
          />
        </div>
      )}

      {phase === 'reading' && newspaper && <PageFlipReader newspaper={newspaper} bw={bw} />}
    </main>
  );
}
