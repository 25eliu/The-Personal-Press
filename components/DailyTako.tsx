'use client';
import dynamic from 'next/dynamic';
import { useEffect, useRef, useState } from 'react';
import type { TNewspaper, TPage } from '@/lib/schema';
import type { GenerateEvent, SectionPlanItem } from '@/lib/stream/events';
import { streamGenerate } from '@/lib/stream/client';
import { BriefInput } from '@/components/BriefInput';
import { BWToggle } from '@/components/BWToggle';
import { TypesettingStage } from '@/components/build/TypesettingStage';

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
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

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

  async function start(b: string) {
    localStorage.setItem('tako-brief', b);
    setBrief(b); setError(null); setNewspaper(null); setPlan([]); setPages([]); setPhase('typesetting');
    abortRef.current = new AbortController();
    try {
      await streamGenerate(b, onEvent, abortRef.current.signal);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong.');
    }
  }

  return (
    <main className="flex min-h-screen flex-col items-center gap-6 p-6">
      {phase !== 'idle' && (
        <div className="flex w-full max-w-6xl items-center justify-between">
          <button onClick={() => setPhase('idle')} className="text-xs uppercase tracking-widest text-[#f4efe2]/70 hover:text-[#f4efe2]">
            ← New paper
          </button>
          <BWToggle bw={bw} onToggle={toggleBw} />
        </div>
      )}

      {error && <p className="rounded bg-red-900/40 px-4 py-2 text-sm text-red-100">{error}</p>}

      {phase === 'idle' && (
        <div className="flex min-h-[70vh] flex-col items-center justify-center">
          <BriefInput initial={brief} onSubmit={start} />
        </div>
      )}

      {(phase === 'typesetting' || phase === 'printing') && (
        <div className={bw ? 'bw' : ''}>
          <TypesettingStage
            plan={plan} pages={pages}
            masthead={meta.masthead} tagline={meta.tagline} edition={meta.edition} dateLine={meta.dateLine}
            printed={phase === 'printing'}
          />
        </div>
      )}

      {phase === 'reading' && newspaper && <PageFlipReader newspaper={newspaper} bw={bw} />}
    </main>
  );
}
