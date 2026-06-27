import { streamAnswerWithTako } from '@/lib/tako/answerStream';
import { encodeAskEvent, type AskEvent } from '@/lib/stream/askEvents';
import { ndjsonStreamResponse } from '@/lib/stream/serverStream';

export const runtime = 'nodejs';
export const maxDuration = 120;

/**
 * Tako-backed Q&A for the copilot's askTako action, streamed as NDJSON so the chat
 * shows tool calls, the outlets being sourced, and the answer token-by-token. Does
 * not touch the newspaper. Shares the safe-enqueue/abort plumbing of /api/generate.
 */
export async function POST(req: Request) {
  let query = '';
  try {
    const body = await req.json();
    query = typeof body?.query === 'string' ? body.query.trim() : '';
  } catch {
    return new Response('Invalid JSON', { status: 400 });
  }
  if (!query) return new Response('Missing query', { status: 400 });

  return ndjsonStreamResponse<AskEvent>(
    req.signal,
    encodeAskEvent,
    (emit) => streamAnswerWithTako(query, emit, req.signal),
    (err) => ({ type: 'error', message: err instanceof Error ? `Tako lookup failed: ${err.message}` : 'Tako lookup failed.' }),
  );
}
