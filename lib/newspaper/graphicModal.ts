import type { TGraphic } from '@/lib/schema';

/**
 * Kinds that draw a visual graph: the modal renders a LARGE version of the graphic above the
 * complete data table. Every other kind is already tabular, so the modal shows the full table
 * alone (no redundant second table).
 */
const VISUAL_KINDS: ReadonlySet<TGraphic['kind']> = new Set(['chart', 'scatter', 'composition']);

export function modalShowsGraphic(kind: TGraphic['kind']): boolean {
  return VISUAL_KINDS.has(kind);
}

/** Larger chart dimensions for the in-modal render (printed paper uses CHART_W/CHART_H). */
export const MODAL_CHART_W = 680;
export const MODAL_CHART_H = 380;

/**
 * Shared row cap. The printed DataTable passes its small default; the modal passes `Infinity`
 * to show every row. Returns the visible rows plus how many were hidden. Never mutates `rows`.
 */
export function capRows<T>(rows: readonly T[], maxRows: number): { shown: T[]; extra: number } {
  const shown = rows.slice(0, maxRows);
  return { shown, extra: rows.length - shown.length };
}
