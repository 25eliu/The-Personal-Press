'use client';
import { forwardRef, useEffect, useRef, useState } from 'react';
import HTMLFlipBook from 'react-pageflip';
import type { TNewspaper, TPage } from '@/lib/schema';
import { NewspaperPage } from '@/components/newspaper/NewspaperPage';

const PAGE_W = 440;
const PAGE_H = 600;

const FlipPage = forwardRef<HTMLDivElement, { children: React.ReactNode }>(function FlipPage(
  { children }, ref,
) {
  return (
    <div ref={ref} className="bg-[#f4efe2] shadow-xl">
      {children}
    </div>
  );
});

// A blank cream leaf used to pad spreads to an even count.
const BlankLeaf = forwardRef<HTMLDivElement>(function BlankLeaf(_props, ref) {
  return <div ref={ref} className="bg-[#efe9da]" style={{ height: PAGE_H }} />;
});

// react-pageflip's types are loose; treat the default export as a component.
const FlipBook = HTMLFlipBook as unknown as React.ComponentType<Record<string, unknown>>;

export function PageFlipReader({ newspaper, bw }: { newspaper: TNewspaper; bw: boolean }) {
  const bookRef = useRef<{ pageFlip: () => { flipNext: () => void; flipPrev: () => void; turnToPage: (n: number) => void } } | null>(null);
  const [page, setPage] = useState(0);
  const [portrait, setPortrait] = useState(false);

  // Two-page spread ("opened up") on wide screens; single page on narrow/mobile.
  useEffect(() => {
    const update = () => setPortrait(window.innerWidth < 900);
    update();
    window.addEventListener('resize', update);
    return () => window.removeEventListener('resize', update);
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const flip = bookRef.current?.pageFlip();
      if (!flip) return;
      if (e.key === 'ArrowRight') flip.flipNext();
      if (e.key === 'ArrowLeft') flip.flipPrev();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // Pad to an even number of leaves so spreads are balanced (landscape only).
  const leaves: (TPage | null)[] = [...newspaper.pages];
  if (!portrait && leaves.length % 2 === 1) leaves.push(null);

  return (
    <div className={`flex w-full flex-col items-center gap-3 ${bw ? 'bw' : ''}`}>
      <div className="flex flex-wrap items-center justify-center gap-2 text-xs text-[#f4efe2]">
        {newspaper.pages.map((p, i) => (
          <button
            key={i}
            onClick={() => bookRef.current?.pageFlip()?.turnToPage(i)}
            className="font-mono-news rounded-sm border border-[#f4efe2]/40 px-2.5 py-0.5 uppercase tracking-wide transition-colors hover:bg-[#f4efe2]/10"
          >
            {i === 0 ? 'Front' : p.topic}
          </button>
        ))}
      </div>

      <FlipBook
        key={portrait ? 'portrait' : 'spread'}
        ref={bookRef as never}
        width={PAGE_W}
        height={PAGE_H}
        size="stretch"
        minWidth={300}
        maxWidth={560}
        minHeight={420}
        maxHeight={760}
        drawShadow
        maxShadowOpacity={0.5}
        showCover={false}
        usePortrait={portrait}
        mobileScrollSupport
        className=""
        style={{}}
        onFlip={(e: { data: number }) => setPage(e.data)}
      >
        {leaves.map((p, i) =>
          p ? (
            <FlipPage key={i}>
              <div className="overflow-hidden" style={{ height: PAGE_H }}>
                <NewspaperPage
                  page={p} slot={i}
                  masthead={newspaper.masthead} tagline={newspaper.tagline}
                  edition={newspaper.edition} dateLine={newspaper.dateLine}
                />
              </div>
            </FlipPage>
          ) : (
            <BlankLeaf key={i} />
          ),
        )}
      </FlipBook>

      <p className="font-mono-news text-xs uppercase tracking-widest text-[#f4efe2]/80">
        Page {page + 1} of {newspaper.pages.length} · ← → or drag a corner
      </p>
    </div>
  );
}

export default PageFlipReader;
