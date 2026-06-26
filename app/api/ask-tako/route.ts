import { streamAnswerWithTako } from '@/lib/tako/answerStream';
import { encodeAskEvent, type AskEvent } from '@/lib/stream/askEvents';

export const runtime = 'nodejs';
export const maxDuration = 120;

/**
 * Tako-backed Q&A for the copilot's askTako action, streamed as NDJSON so the chat
 * shows tool calls, the outlets being sourced, and the answer token-by-token. Does
 * not touch the newspaper. Mirrors the safe-enqueue/abort handling of /api/generate.
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

  const signal = req.signal;

  const stream = new ReadableStream({
    async start(controller) {
      let closed = false;
      const safeEnqueue = (e: AskEvent) => {
        if (closed || signal.aborted) return;
        try {
          controller.enqueue(encodeAskEvent(e));
        } catch {
          closed = true;
        }
      };
      const onAbort = () => { closed = true; };
      signal.addEventListener('abort', onAbort);

      try {
        await streamAnswerWithTako(query, safeEnqueue, signal);
      } catch (err) {
        safeEnqueue({ type: 'error', message: err instanceof Error ? `Tako lookup failed: ${err.message}` : 'Tako lookup failed.' });
      } finally {
        signal.removeEventListener('abort', onAbort);
        if (!closed) {
          try { controller.close(); } catch { /* already closed */ }
        }
      }
    },
    cancel() {
      // Client went away — stop writing.
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'application/x-ndjson; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
    },
  });
}
