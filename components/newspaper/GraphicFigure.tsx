import type { ReactNode } from 'react';

/**
 * The one figure box every graphic renders through. `overflow-hidden` is the hard backstop:
 * whatever a child draws (a wide recharts axis label, a long table cell) is clipped to the
 * border, so NO graphic ever bleeds past its column. Border + padding + caption match the
 * newsprint idiom shared with DataTable/NewsChart.
 */
export function GraphicFigure({
  caption,
  className,
  children,
}: {
  caption?: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <figure className={`max-w-full overflow-hidden border border-black/80 p-1 ${className ?? ''}`}>
      {children}
      {caption && <figcaption className="mt-1 text-[10px] italic leading-snug">{caption}</figcaption>}
    </figure>
  );
}
