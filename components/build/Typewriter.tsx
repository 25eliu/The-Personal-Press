'use client';
import { useEffect, useState } from 'react';

/**
 * A typewriter that types a message out, holds, erases it, and moves to the next —
 * the press's loading indicator. Monospace type with a blinking carriage cursor and
 * no color flashes; it just clatters through newsroom status lines until the edition
 * is ready. Messages cycle forever (the caller unmounts it when the paper is done).
 */
export function Typewriter({
  messages,
  className = '',
  typeMs = 44,
  eraseMs = 24,
  holdMs = 1500,
}: {
  messages: string[];
  className?: string;
  typeMs?: number;
  eraseMs?: number;
  holdMs?: number;
}) {
  const [idx, setIdx] = useState(0);
  const [text, setText] = useState('');
  const [phase, setPhase] = useState<'typing' | 'holding' | 'erasing'>('typing');

  useEffect(() => {
    const full = messages.length ? messages[idx % messages.length] : '';
    let t: ReturnType<typeof setTimeout>;
    if (phase === 'typing') {
      if (text.length < full.length) {
        t = setTimeout(() => setText(full.slice(0, text.length + 1)), typeMs);
      } else {
        t = setTimeout(() => setPhase('holding'), holdMs);
      }
    } else if (phase === 'holding') {
      t = setTimeout(() => setPhase('erasing'), 120);
    } else {
      if (text.length > 0) {
        t = setTimeout(() => setText(full.slice(0, text.length - 1)), eraseMs);
      } else {
        // Advance to the next message on a tick so we don't setState synchronously
        // inside the effect body.
        t = setTimeout(() => {
          setPhase('typing');
          setIdx((i) => (i + 1) % Math.max(1, messages.length));
        }, eraseMs);
      }
    }
    return () => clearTimeout(t);
  }, [text, phase, idx, messages, typeMs, eraseMs, holdMs]);

  return (
    <span className={`font-mono-news ${className}`} aria-live="polite">
      {text}
      <span className="tw-caret" aria-hidden>▍</span>
    </span>
  );
}
