/**
 * Shared NDJSON-over-fetch reader. POST `payload` to `endpoint`, then read the response
 * body, decoding and parsing complete event lines as they arrive (flushing any trailing
 * partial at the end) and handing each event to `onEvent`. Generic over the event type +
 * its line parser, so the edit and ask clients share one read loop. Throws
 * `${errorLabel} (${status})` if the response isn't a readable stream.
 */
export async function streamFromApi<E>(
  endpoint: string,
  payload: unknown,
  parse: (buffer: string) => { events: E[]; rest: string },
  onEvent: (e: E) => void,
  opts: { signal?: AbortSignal; errorLabel: string },
): Promise<void> {
  const res = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
    signal: opts.signal,
  });
  if (!res.ok || !res.body) {
    throw new Error(`${opts.errorLabel} (${res.status})`);
  }
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const { events, rest } = parse(buffer);
    buffer = rest;
    for (const e of events) onEvent(e);
  }
  const { events } = parse(buffer + '\n');
  for (const e of events) onEvent(e);
}
