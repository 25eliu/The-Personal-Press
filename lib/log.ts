// Structured server-side logging for every model / Tako API call.
// Emits one JSON line per event to stdout (server logs only — never the client).

export type LogKind =
  | 'request'
  | 'editor.start'
  | 'editor.done'
  | 'reporter.start'
  | 'reporter.done'
  | 'tool.call'
  | 'synthesize.start'
  | 'synthesize.done'
  | 'distill.start'
  | 'distill.done'
  | 'ask.start'
  | 'ask.done'
  | 'error';

type Usage = { inputTokens?: number; outputTokens?: number; totalTokens?: number } | undefined;

/** Pull a token-usage summary off an AI SDK result without assuming exact field names. */
export function usageSummary(usage: unknown): Usage {
  if (!usage || typeof usage !== 'object') return undefined;
  const u = usage as Record<string, number | undefined>;
  const inputTokens = u.inputTokens ?? u.promptTokens;
  const outputTokens = u.outputTokens ?? u.completionTokens;
  const totalTokens = u.totalTokens ?? ((inputTokens ?? 0) + (outputTokens ?? 0) || undefined);
  return { inputTokens, outputTokens, totalTokens };
}

/** Log one structured event. Truncates long free-text so logs stay readable. */
export function logCall(kind: LogKind, data: Record<string, unknown> = {}): void {
  const line = {
    t: new Date().toISOString(),
    app: 'daily-tako',
    kind,
    ...data,
  };
  // Errors to stderr, everything else to stdout.
  if (kind === 'error') console.error(JSON.stringify(line));
  else console.log(JSON.stringify(line));
}

/** Trim free text for log fields. */
export function clip(s: unknown, max = 120): string | undefined {
  if (typeof s !== 'string') return undefined;
  return s.length > max ? `${s.slice(0, max)}…` : s;
}
