import type { GenerateEvent } from '@/lib/stream/events';
import { parseEventLines } from '@/lib/stream/ndjson';

export async function streamGenerate(
  brief: string,
  onEvent: (e: GenerateEvent) => void,
  signal?: AbortSignal,
): Promise<void> {
  const res = await fetch('/api/generate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ brief }),
    signal,
  });
  if (!res.ok || !res.body) {
    throw new Error(`Generation failed (${res.status})`);
  }
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const { events, rest } = parseEventLines(buffer);
    buffer = rest;
    for (const e of events) onEvent(e);
  }
  const { events } = parseEventLines(buffer + '\n');
  for (const e of events) onEvent(e);
}
