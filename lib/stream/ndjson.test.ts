import { expect, test } from 'vitest';
import { encodeEvent, parseEventLines } from '@/lib/stream/ndjson';
import type { GenerateEvent } from '@/lib/stream/events';

test('encodeEvent emits one JSON line terminated by newline', () => {
  const ev: GenerateEvent = { type: 'section_started', slot: 1, topic: 'Fed' };
  const text = new TextDecoder().decode(encodeEvent(ev));
  expect(text.endsWith('\n')).toBe(true);
  expect(JSON.parse(text)).toEqual(ev);
});

test('parseEventLines returns complete events and keeps partial remainder', () => {
  const a: GenerateEvent = { type: 'section_started', slot: 0, topic: 'A' };
  const b: GenerateEvent = { type: 'section_started', slot: 1, topic: 'B' };
  const chunk = JSON.stringify(a) + '\n' + JSON.stringify(b) + '\n' + '{"type":"comp';
  const { events, rest } = parseEventLines(chunk);
  expect(events).toEqual([a, b]);
  expect(rest).toBe('{"type":"comp');
});

test('parseEventLines with no complete line returns empty events', () => {
  const { events, rest } = parseEventLines('{"partial":');
  expect(events).toEqual([]);
  expect(rest).toBe('{"partial":');
});
