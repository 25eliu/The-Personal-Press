'use client';
import { AnimatePresence, motion } from 'framer-motion';
import type { TPage } from '@/lib/schema';
import type { SectionPlanItem } from '@/lib/stream/events';
import { NewspaperPage } from '@/components/newspaper/NewspaperPage';
import { ColumnBlock } from './ColumnBlock';

export function TypesettingStage({ plan, pages, masthead, tagline, edition, dateLine, printed }: {
  plan: SectionPlanItem[];
  pages: (TPage | null)[];
  masthead: string; tagline: string; edition: string; dateLine: string;
  printed: boolean;
}) {
  return (
    <motion.div
      animate={printed ? { scale: [1, 0.98, 1], y: [0, 6, 0] } : {}}
      transition={{ duration: 0.5 }}
      className="grid w-full max-w-6xl grid-cols-1 gap-4 md:grid-cols-2"
    >
      {plan.map((item) => {
        const page = pages[item.slot];
        return (
          <div key={item.slot} className="aspect-[3/4] overflow-hidden border border-black/50 shadow-lg">
            <AnimatePresence mode="wait">
              {page ? (
                <motion.div
                  key="page"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ duration: 0.4 }}
                  className="h-full w-full"
                >
                  <NewspaperPage
                    page={page} slot={item.slot}
                    masthead={masthead} tagline={tagline} edition={edition} dateLine={dateLine}
                  />
                </motion.div>
              ) : (
                <motion.div key="block" exit={{ opacity: 0 }} className="h-full w-full">
                  <ColumnBlock index={item.slot} topic={item.topic} />
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        );
      })}
    </motion.div>
  );
}
