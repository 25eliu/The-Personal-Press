import type { GenerateEvent } from '@/lib/stream/events';

const encoder = new TextEncoder();

export function encodeEvent(e: GenerateEvent): Uint8Array {
  return encoder.encode(JSON.stringify(e) + '\n');
}

export function parseEventLines(buffer: string): { events: GenerateEvent[]; rest: string } {
  const parts = buffer.split('\n');
  const rest = parts.pop() ?? '';
  const events: GenerateEvent[] = [];
  for (const line of parts) {
    const trimmed = line.trim();
    if (trimmed === '') continue;
    events.push(JSON.parse(trimmed) as GenerateEvent);
  }
  return { events, rest };
}
