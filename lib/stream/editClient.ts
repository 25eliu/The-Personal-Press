import type { GenerateEvent } from '@/lib/stream/events';
import { parseEventLines } from '@/lib/stream/ndjson';
import type { TPage } from '@/lib/schema';

/**
 * Run ONE reporter against a topic via /api/edit-section and stream its events
 * (section_started → tool_activity* → section_done | error). Reuses the same NDJSON
 * codec as the generation stream. Resolves with the produced page, or null on error.
 */
export async function streamEditSection(
  body: { topic: string; isFront?: boolean; context?: string },
  onEvent: (e: GenerateEvent) => void,
  signal?: AbortSignal,
): Promise<TPage | null> {
  const res = await fetch('/api/edit-section', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal,
  });
  if (!res.ok || !res.body) {
    throw new Error(`Section research failed (${res.status})`);
  }
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let page: TPage | null = null;

  const consume = (e: GenerateEvent) => {
    if (e.type === 'section_done') page = e.page;
    onEvent(e);
  };

  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const { events, rest } = parseEventLines(buffer);
    buffer = rest;
    for (const e of events) consume(e);
  }
  const { events } = parseEventLines(buffer + '\n');
  for (const e of events) consume(e);

  return page;
}
