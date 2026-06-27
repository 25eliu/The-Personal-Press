/**
 * One place for the NDJSON streaming-Response boilerplate every POST route repeated:
 * a ReadableStream whose `start` enqueues events only while the client is connected
 * (guarding the "Controller is already closed" throw on abort), forwards a producer's
 * output through a `safeEnqueue`, converts a thrown error into a final event, and closes
 * cleanly. Generic over the event type + its encoder so generate/edit (GenerateEvent)
 * and ask (AskEvent) share the exact same plumbing.
 */
export function ndjsonStreamResponse<E>(
  signal: AbortSignal,
  encode: (e: E) => Uint8Array,
  run: (emit: (e: E) => void) => Promise<void>,
  onError: (err: unknown) => E,
): Response {
  const stream = new ReadableStream({
    async start(controller) {
      let closed = false;
      // Enqueue only while live. Once the client aborts (New paper, re-run, navigate
      // away) the controller is closed/cancelled and enqueuing throws — guard every write.
      const emit = (e: E) => {
        if (closed || signal.aborted) return;
        try {
          controller.enqueue(encode(e));
        } catch {
          closed = true;
        }
      };
      const onAbort = () => {
        closed = true;
      };
      signal.addEventListener('abort', onAbort);
      try {
        await run(emit);
      } catch (err) {
        emit(onError(err));
      } finally {
        signal.removeEventListener('abort', onAbort);
        if (!closed) {
          try {
            controller.close();
          } catch {
            /* already closed */
          }
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
