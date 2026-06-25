import type { TSource } from '@/lib/schema';

export function SourceCredit({ sources }: { sources: TSource[] }) {
  return (
    <p className="mt-1 text-[10px] uppercase tracking-wide text-black/60">
      Sources:{' '}
      {sources.map((s, i) => (
        <span key={`${s.name}-${i}`}>
          {i > 0 && ' · '}
          {s.url ? (
            <a href={s.url} className="underline" target="_blank" rel="noreferrer">{s.name}</a>
          ) : (
            s.name
          )}
        </span>
      ))}
    </p>
  );
}
