// Human-facing labels for Tako tool calls, surfaced in the build animation
// ("Using Tako search…") and the wire ticker. Pure + testable.

export function toolLabel(tool: string): string {
  switch (tool) {
    case 'tako_search':
      return 'Using Tako search';
    case 'tako_contents':
      return 'Reading Tako data';
    default:
      return `Using ${tool.replace(/_/g, ' ')}`;
  }
}

/** Extract the human-readable subject of a tool call from its input args. */
export function toolDetail(input: unknown): string | undefined {
  if (!input || typeof input !== 'object') return undefined;
  const i = input as Record<string, unknown>;
  const q = i.query ?? i.url;
  return typeof q === 'string' && q.trim() ? q.trim() : undefined;
}
