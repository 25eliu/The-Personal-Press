import type { TPage } from '@/lib/schema';
import { Article } from './Article';
import { Masthead } from './Masthead';

export function NewspaperPage({ page, slot, masthead, tagline, edition, dateLine }: {
  page: TPage; slot: number; masthead: string; tagline: string; edition: string; dateLine: string;
}) {
  const isFront = slot === 0;
  return (
    <section className="paper w-full px-6 py-6">
      {isFront ? (
        <Masthead masthead={masthead} tagline={tagline} edition={edition} dateLine={dateLine} />
      ) : (
        <div className="mb-3 flex items-baseline justify-between border-y-[3px] border-double border-black py-1">
          <h2 className="font-head text-xl font-black uppercase tracking-wide">{page.topic}</h2>
          <span className="font-mono-news text-[9px] uppercase tracking-widest text-black/70">{masthead}</span>
        </div>
      )}
      <div className="flex flex-col">
        {page.articles.map((a, i) => (
          <div key={i} className={i > 0 ? 'mt-3 border-t border-black/35 pt-3' : ''}>
            <Article article={a} />
          </div>
        ))}
      </div>
    </section>
  );
}
