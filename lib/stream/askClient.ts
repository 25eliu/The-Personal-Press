import { parseAskEventLines, type AskEvent } from '@/lib/stream/askEvents';
import { streamFromApi } from '@/lib/stream/streamFromApi';

/**
 * Stream a Tako-backed answer from /api/ask-tako, surfacing each event as it
 * arrives — tool calls, the outlets being sourced, and the answer token-by-token —
 * so the chat shows progress immediately instead of waiting for the whole reply.
 * Reuses the shared NDJSON-over-fetch reader.
 */
export async function streamAskTako(
  query: string,
  onEvent: (e: AskEvent) => void,
  signal?: AbortSignal,
): Promise<void> {
  await streamFromApi<AskEvent>('/api/ask-tako', { query }, parseAskEventLines, onEvent, {
    signal,
    errorLabel: 'Tako lookup failed',
  });
}
