import type { TSource } from '@/lib/schema';
import { SourceCredit } from './SourceCredit';

export function Figure({ src, caption, sources }: { src: string; caption?: string; sources?: TSource[] }) {
  return (
    <figure className="my-2 border border-black/80 p-1">
      <div className="halftone">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={src} alt={caption ?? 'chart'} className="w-full" />
      </div>
      {caption && <figcaption className="mt-1 text-[11px] italic">{caption}</figcaption>}
      {sources && sources.length > 0 && <SourceCredit sources={sources} />}
    </figure>
  );
}
