import { parseAskEventLines, type AskEvent } from '@/lib/stream/askEvents';

/**
 * Stream a Tako-backed answer from /api/ask-tako, surfacing each event as it
 * arrives — tool calls, the outlets being sourced, and the answer token-by-token —
 * so the chat shows progress immediately instead of waiting for the whole reply.
 * Reuses the same NDJSON-over-fetch pattern as the generation/edit streams.
 */
export async function streamAskTako(
  query: string,
  onEvent: (e: AskEvent) => void,
  signal?: AbortSignal,
): Promise<void> {
  const res = await fetch('/api/ask-tako', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query }),
    signal,
  });
  if (!res.ok || !res.body) {
    throw new Error(`Tako lookup failed (${res.status})`);
  }
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const { events, rest } = parseAskEventLines(buffer);
    buffer = rest;
    for (const e of events) onEvent(e);
  }
  const { events } = parseAskEventLines(buffer + '\n');
  for (const e of events) onEvent(e);
}
