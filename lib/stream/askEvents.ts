// Streaming protocol for the copilot's Tako Q&A (askTako). Kept deliberately
// SEPARATE from GenerateEvent so the conversational answer path can stream tokens
// + sources without entangling the shared generation/edit event union.

export type AskSource = { name: string; url?: string };

export type AskEvent =
  | { type: 'tool'; label: string; detail?: string } // a Tako tool call started
  | { type: 'sources'; sources: string[] } // concrete outlets a step pulled from
  | { type: 'token'; text: string } // one delta of the streamed answer
  | { type: 'done'; answer: string; sources: AskSource[] } // final answer + citations
  | { type: 'error'; message: string };

const encoder = new TextEncoder();

export function encodeAskEvent(e: AskEvent): Uint8Array {
  return encoder.encode(JSON.stringify(e) + '\n');
}

/** Split a buffer into complete AskEvents, returning any partial trailing line. */
export function parseAskEventLines(buffer: string): { events: AskEvent[]; rest: string } {
  const parts = buffer.split('\n');
  const rest = parts.pop() ?? '';
  const events: AskEvent[] = [];
  for (const line of parts) {
    const trimmed = line.trim();
    if (trimmed === '') continue;
    events.push(JSON.parse(trimmed) as AskEvent);
  }
  return { events, rest };
}
