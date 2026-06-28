import type { TGraphic, TTableData } from '@/lib/schema';
import { detectColumnUnit, parseNumeric } from '@/lib/newspaper/tableShape';
import { formatLabel, shortLabel, withUnit } from '@/lib/newspaper/format';
import { GraphicFigure } from './GraphicFigure';

type Stat = Extract<TGraphic, { kind: 'stat' }>;

type Tile = { label: string; value: string; delta: number | null };

const cell = (table: TTableData, row: string[], col: string): string => row[table.columns.indexOf(col)] ?? '';

/** Format a raw cell as a big figure: numeric → abbreviated + (only its own) unit; else raw text. */
function figure(raw: string, unit?: string): string {
  const n = parseNumeric(raw);
  return n === null ? raw.trim() || '—' : withUnit(n, unit);
}

function tiles(graphic: Stat, table: TTableData): Tile[] {
  // Unit is per-COLUMN (explicit override wins) so a count column never borrows a money
  // column's "$" — the "$2 transactions" bug. One row → a tile per value column; many rows
  // → a tile per row.
  if (table.rows.length === 1) {
    const row = table.rows[0];
    return graphic.valueColumns.slice(0, 4).map((col) => ({
      label: shortLabel(col),
      value: figure(cell(table, row, col), graphic.unit ?? detectColumnUnit(table, col)),
      delta: graphic.deltaColumn ? parseNumeric(cell(table, row, graphic.deltaColumn)) : null,
    }));
  }
  const value = graphic.valueColumns[0];
  const unit = graphic.unit ?? detectColumnUnit(table, value);
  return table.rows.slice(0, 4).map((row) => ({
    label: formatLabel(cell(table, row, graphic.labelColumn)),
    value: figure(cell(table, row, value), unit),
    delta: graphic.deltaColumn ? parseNumeric(cell(table, row, graphic.deltaColumn)) : null,
  }));
}

/**
 * Single-fact / KPI figure block: one to four big serif numerals with a label and an
 * optional ▲/▼ delta. The natural home for Tako data too thin to chart (a lone figure,
 * a final score, a handful of headline indicators). Ink-on-paper, no colour.
 */
export function StatCallout({ graphic, table, caption }: { graphic: Stat; table: TTableData; caption: string }) {
  const items = tiles(graphic, table);
  const cols = Math.min(items.length, items.length <= 1 ? 1 : 2);
  return (
    <GraphicFigure caption={caption}>
      <div className="grid gap-x-3 gap-y-2 px-1 py-1.5" style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}>
        {items.map((t, i) => (
          <div key={i} className="min-w-0">
            <div className="flex items-baseline gap-1">
              <span className="truncate font-head font-black leading-none text-[26px]">{t.value}</span>
              {t.delta !== null && t.delta !== 0 && (
                <span className="shrink-0 text-[11px] font-bold leading-none">
                  {t.delta > 0 ? '▲' : '▼'}
                  {withUnit(Math.abs(t.delta), graphic.unit)}
                </span>
              )}
            </div>
            <div className="mt-0.5 truncate text-[9px] uppercase tracking-wide text-black/60">{t.label}</div>
          </div>
        ))}
      </div>
    </GraphicFigure>
  );
}
