'use client';
import { motion } from 'framer-motion';

export function ColumnBlock({ index, topic, activity }: { index: number; topic: string; activity?: string }) {
  return (
    <motion.div
      initial={{ rotateY: 90, opacity: 0, y: 24 }}
      animate={{ rotateY: 0, opacity: 1, y: 0 }}
      transition={{ delay: index * 0.08, duration: 0.5, ease: 'easeOut' }}
      className="paper flex h-full w-full flex-col gap-2 p-5"
      style={{ transformPerspective: 1200 }}
    >
      <div className="h-6 w-3/4 bg-black/80" />
      <div className="h-3 w-1/3 bg-black/40" />
      <div className="mt-2 h-28 w-full border border-black/60 bg-black/5" />
      {Array.from({ length: 8 }).map((_, i) => (
        <div key={i} className="h-2 w-full bg-black/15" />
      ))}
      <p className="font-mono-news mt-auto flex items-center justify-center gap-2 text-center text-[10px] uppercase tracking-widest text-black/55">
        {activity ? (
          <>
            <span className="live-dot text-[var(--accent)]">●</span>
            <span className="truncate">{activity}</span>
          </>
        ) : (
          <>Setting type — {topic}</>
        )}
      </p>
    </motion.div>
  );
}
