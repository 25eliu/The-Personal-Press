import { expect, test, vi } from 'vitest';
import { streamGenerate } from '@/lib/stream/client';
import type { GenerateEvent } from '@/lib/stream/events';

function bodyFrom(lines: string): ReadableStream<Uint8Array> {
  const enc = new TextEncoder();
  return new ReadableStream({
    start(c) { c.enqueue(enc.encode(lines)); c.close(); },
  });
}

test('streamGenerate parses NDJSON body into events', async () => {
  const ev1: GenerateEvent = { type: 'section_started', slot: 0, topic: 'A' };
  const ev2: GenerateEvent = { type: 'error', message: 'x' };
  const body = bodyFrom(JSON.stringify(ev1) + '\n' + JSON.stringify(ev2) + '\n');
  vi.stubGlobal('fetch', vi.fn(async () => new Response(body)));

  const seen: GenerateEvent[] = [];
  await streamGenerate('brief', (e) => seen.push(e));
  expect(seen).toEqual([ev1, ev2]);
  vi.unstubAllGlobals();
});
