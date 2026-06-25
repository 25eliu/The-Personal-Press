import type { TPage } from '@/lib/schema';
import { Article } from './Article';
import { Masthead } from './Masthead';

export function NewspaperPage({ page, slot, masthead, tagline, edition, dateLine }: {
  page: TPage; slot: number; masthead: string; tagline: string; edition: string; dateLine: string;
}) {
  const isFront = slot === 0;
  return (
    <section className="paper h-full w-full overflow-hidden p-5">
      {isFront ? (
        <Masthead masthead={masthead} tagline={tagline} edition={edition} dateLine={dateLine} />
      ) : (
        <div className="mb-2 flex items-baseline justify-between border-b-2 border-black pb-1">
          <h2 className="font-head text-2xl font-black uppercase">{page.topic}</h2>
          <span className="text-[10px] uppercase tracking-widest">{masthead}</span>
        </div>
      )}
      <div className="col-rule columns-1 gap-4 md:columns-2 [&>*]:break-inside-avoid">
        {page.articles.map((a, i) => (
          <Article key={i} article={a} />
        ))}
      </div>
    </section>
  );
}
