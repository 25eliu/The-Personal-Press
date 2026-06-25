'use client';
import { forwardRef, useEffect, useRef, useState } from 'react';
import HTMLFlipBook from 'react-pageflip';
import type { TNewspaper } from '@/lib/schema';
import { NewspaperPage } from '@/components/newspaper/NewspaperPage';

const FlipPage = forwardRef<HTMLDivElement, { children: React.ReactNode }>(function FlipPage(
  { children }, ref,
) {
  return (
    <div ref={ref} className="bg-[#f4efe2] shadow-xl">
      {children}
    </div>
  );
});

// react-pageflip's types are loose; treat the default export as a component.
const FlipBook = HTMLFlipBook as unknown as React.ComponentType<Record<string, unknown>>;

export function PageFlipReader({ newspaper, bw }: { newspaper: TNewspaper; bw: boolean }) {
  const bookRef = useRef<{ pageFlip: () => { flipNext: () => void; flipPrev: () => void; turnToPage: (n: number) => void } } | null>(null);
  const [page, setPage] = useState(0);

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

  return (
    <div className={`flex flex-col items-center gap-3 ${bw ? 'bw' : ''}`}>
      <div className="flex flex-wrap items-center justify-center gap-2 text-xs text-[#f4efe2]">
        {newspaper.pages.map((p, i) => (
          <button
            key={i}
            onClick={() => bookRef.current?.pageFlip()?.turnToPage(i)}
            className="rounded border border-[#f4efe2]/40 px-2 py-0.5 hover:bg-[#f4efe2]/10"
          >
            {i === 0 ? 'Front' : p.topic}
          </button>
        ))}
      </div>

      <FlipBook
        ref={bookRef as never}
        width={460}
        height={620}
        size="stretch"
        minWidth={300}
        maxWidth={600}
        minHeight={420}
        maxHeight={820}
        drawShadow
        maxShadowOpacity={0.4}
        showCover={false}
        mobileScrollSupport
        className=""
        style={{}}
        onFlip={(e: { data: number }) => setPage(e.data)}
      >
        {newspaper.pages.map((p, i) => (
          <FlipPage key={i}>
            <div className="h-[620px] w-full overflow-hidden">
              <NewspaperPage
                page={p} slot={i}
                masthead={newspaper.masthead} tagline={newspaper.tagline}
                edition={newspaper.edition} dateLine={newspaper.dateLine}
              />
            </div>
          </FlipPage>
        ))}
      </FlipBook>

      <p className="text-xs text-[#f4efe2]/80">
        Page {page + 1} of {newspaper.pages.length} · ← → to flip
      </p>
    </div>
  );
}

export default PageFlipReader;
