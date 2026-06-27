import { orchestrate } from '@/lib/agents/orchestrate';
import { encodeEvent } from '@/lib/stream/ndjson';
import type { GenerateEvent } from '@/lib/stream/events';
import { ndjsonStreamResponse } from '@/lib/stream/serverStream';

export const runtime = 'nodejs';
export const maxDuration = 120;

export async function POST(req: Request) {
  let brief = '';
  try {
    const body = await req.json();
    brief = typeof body?.brief === 'string' ? body.brief.trim() : '';
  } catch {
    return new Response('Invalid JSON', { status: 400 });
  }
  if (!brief) return new Response('Missing brief', { status: 400 });

  return ndjsonStreamResponse<GenerateEvent>(
    req.signal,
    encodeEvent,
    (emit) => orchestrate(brief, emit, req.signal),
    (err) => ({ type: 'error', message: err instanceof Error ? err.message : 'Generation failed.' }),
  );
}
