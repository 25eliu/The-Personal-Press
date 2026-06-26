import { orchestrate } from '@/lib/agents/orchestrate';
import { encodeEvent } from '@/lib/stream/ndjson';
import type { GenerateEvent } from '@/lib/stream/events';

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

  const signal = req.signal;

  const stream = new ReadableStream({
    async start(controller) {
      let closed = false;

      // Enqueue only while the stream is live. Once the client aborts (New paper,
      // re-run, navigate away) the controller is closed/cancelled; enqueuing then
      // throws "Invalid state: Controller is already closed". Guard every write.
      const safeEnqueue = (e: GenerateEvent) => {
        if (closed || signal.aborted) return;
        try {
          controller.enqueue(encodeEvent(e));
        } catch {
          closed = true;
        }
      };

      const onAbort = () => { closed = true; };
      signal.addEventListener('abort', onAbort);

      try {
        await orchestrate(brief, safeEnqueue, signal);
      } catch (err) {
        safeEnqueue({ type: 'error', message: err instanceof Error ? err.message : 'Generation failed.' });
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
