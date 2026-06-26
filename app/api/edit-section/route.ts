import { BRAND } from '@/lib/config';
import { hasRealContent, runReporter } from '@/lib/agents/reporter';
import { todayContext } from '@/lib/time/clock';
import { encodeEvent } from '@/lib/stream/ndjson';
import type { GenerateEvent } from '@/lib/stream/events';

export const runtime = 'nodejs';
export const maxDuration = 120;

/**
 * Runs ONE reporter for a single topic and streams the same NDJSON events as the
 * generation pipeline (section_started → tool_activity* → section_done | error).
 * The copilot's addSection/refreshChart actions consume this to show live Tako
 * activity in the chat and merge the returned page. Slot is a placeholder (0) — the
 * client assigns the real slot when it dispatches the edit.
 */
export async function POST(req: Request) {
  let topic = '';
  let isFront = false;
  let context: string | undefined;
  try {
    const body = await req.json();
    topic = typeof body?.topic === 'string' ? body.topic.trim() : '';
    isFront = body?.isFront === true;
    context = typeof body?.context === 'string' ? body.context : undefined;
  } catch {
    return new Response('Invalid JSON', { status: 400 });
  }
  if (!topic) return new Response('Missing topic', { status: 400 });

  const signal = req.signal;

  const stream = new ReadableStream({
    async start(controller) {
      let closed = false;
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
        safeEnqueue({ type: 'section_started', slot: 0, topic });
        const page = await runReporter(topic, isFront, BRAND, todayContext(), {
          context,
          onActivity: (a) => safeEnqueue({ type: 'tool_activity', slot: 0, topic, tool: a.tool, label: a.label, detail: a.detail, sources: a.sources }),
          onDraftToken: (t) => safeEnqueue({ type: 'token', slot: 0, text: t }),
          signal,
        });
        if (!hasRealContent(page)) {
          safeEnqueue({ type: 'error', message: `No fresh reporting found for “${topic}”.` });
        } else {
          safeEnqueue({ type: 'section_done', slot: 0, page });
        }
      } catch (err) {
        safeEnqueue({ type: 'error', message: err instanceof Error ? err.message : 'Section research failed.' });
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
