import { orchestrate } from '@/lib/agents/orchestrate';
import { encodeEvent } from '@/lib/stream/ndjson';

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

  const stream = new ReadableStream({
    async start(controller) {
      try {
        await orchestrate(brief, (e) => controller.enqueue(encodeEvent(e)));
      } catch (err) {
        controller.enqueue(
          encodeEvent({ type: 'error', message: err instanceof Error ? err.message : 'Generation failed.' }),
        );
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'application/x-ndjson; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
    },
  });
}
