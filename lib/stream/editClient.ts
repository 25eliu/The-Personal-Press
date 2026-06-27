import type { GenerateEvent } from '@/lib/stream/events';
import { parseEventLines } from '@/lib/stream/ndjson';
import { streamFromApi } from '@/lib/stream/streamFromApi';
import type { TPage } from '@/lib/schema';

/**
 * Run ONE reporter against a topic via /api/edit-section and stream its events
 * (section_started → tool_activity* → section_done | error). Reuses the shared NDJSON
 * reader; captures the produced page from section_done. Resolves with it, or null.
 */
export async function streamEditSection(
  body: { topic: string; isFront?: boolean; context?: string },
  onEvent: (e: GenerateEvent) => void,
  signal?: AbortSignal,
): Promise<TPage | null> {
  let page: TPage | null = null;
  await streamFromApi<GenerateEvent>(
    '/api/edit-section',
    body,
    parseEventLines,
    (e) => {
      if (e.type === 'section_done') page = e.page;
      onEvent(e);
    },
    { signal, errorLabel: 'Section research failed' },
  );
  return page;
}
