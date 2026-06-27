'use client';
import { useEffect, useRef, useState } from 'react';
import type { TPage } from '@/lib/schema';
import { linear, tween } from '@/lib/edition/tween';

/** Total typed characters in a page: every article's headline + dek + body. */
export function pageChars(page: TPage): number {
  return page.articles.reduce((n, a) => n + a.headline.length + (a.dek?.length ?? 0) + a.body.length, 0);
}

/** Per-page reveal duration, scaled to its length and clamped to feel lively but readable. */
const revealMs = (total: number) => Math.min(4200, Math.max(700, total * 3.2));

/**
 * Drives the initial-generation typewriter reveal STRICTLY front-to-back, IN SLOT ORDER:
 * page `order[0]` types in, then `order[1]`, and so on. A page only starts once it has
 * arrived (`pages[slot]` set) — if the next-in-order page hasn't been generated yet the
 * reveal WAITS (showing the skeleton), even if a later section already finished. Once every
 * page in `order` has revealed AND generation has completed, `onFinished` fires once (the
 * caller drops into the page-flip reader).
 *
 * Returns which slots are fully revealed, which slot is currently typing, and that slot's
 * character cursor — the build view renders each page accordingly.
 */
export function usePageRevealQueue(
  order: number[],
  pages: (TPage | null)[],
  generationDone: boolean,
  onFinished: () => void,
): { doneSlots: Set<number>; activeSlot: number | null; cursor: number } {
  const [doneCount, setDoneCount] = useState(0); // how many of `order` have fully revealed
  const [cursor, setCursor] = useState(0); // chars revealed in the active page
  const [active, setActive] = useState<number | null>(null); // the slot currently typing

  const runningRef = useRef(false);
  const finishedRef = useRef(false);
  const cancelRef = useRef<(() => void) | null>(null);
  const onFinishedRef = useRef(onFinished);
  useEffect(() => {
    onFinishedRef.current = onFinished;
  });

  useEffect(() => {
    if (runningRef.current) return; // a page is already revealing — leave it be
    if (doneCount >= order.length) {
      // Everything queued has revealed — once generation is done, hand off (even with an
      // empty/failed run, so we still advance to the reader).
      if (generationDone && !finishedRef.current) {
        finishedRef.current = true;
        onFinishedRef.current();
      }
      return;
    }
    const slot = order[doneCount];
    const page = pages[slot];
    if (!page) return; // next-in-order page not generated yet — wait (re-runs on `pages` change)

    runningRef.current = true;
    // Kicking off this page's rAF reveal — the legitimate "start an external animation" use
    // of setState-in-effect (per-frame updates below run in the rAF callback).
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setActive(slot);
    setCursor(0);
    const total = pageChars(page);
    let cancelled = false;
    cancelRef.current = () => {
      cancelled = true;
    };
    tween(0, total, revealMs(total), linear, (v) => setCursor(Math.round(v)), () => cancelled).then(() => {
      if (cancelled) return;
      runningRef.current = false;
      setActive(null);
      setDoneCount((c) => c + 1); // dep change below starts the next page
    });
  }, [order, pages, generationDone, doneCount]);

  // Cancel the in-flight tween only when the component unmounts.
  useEffect(() => () => cancelRef.current?.(), []);

  return { doneSlots: new Set(order.slice(0, doneCount)), activeSlot: active, cursor };
}
