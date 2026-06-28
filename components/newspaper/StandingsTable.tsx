import type { TGraphic, TTableData } from '@/lib/schema';
import { detectColumnUnit, parseNumeric } from '@/lib/newspaper/tableShape';
import { formatCell, shortLabel } from '@/lib/newspaper/format';
import { GraphicFigure } from './GraphicFigure';

type Standings = Extract<TGraphic, { kind: 'standings' }>;

const cell = (table: TTableData, row: string[], col: string): string => row[table.columns.indexOf(col)] ?? '';

// Keep the league table legible inside ~250px: at most this many stat columns and rows.
const MAX_STATS = 4;
const MAX_ROWS = 12;

/** A movement cell ("+1" / "-2" / "0") → a rank-change arrow, or a dash when flat/missing. */
function movement(raw: string): { glyph: string; weight: string } {
  const n = parseNumeric(raw);
  if (n === null || n === 0) return { glyph: '–', weight: 'text-black/40' };
  return n > 0 ? { glyph: `▲${Math.abs(n)}`, weight: 'font-bold' } : { glyph: `▼${Math.abs(n)}`, weight: 'font-bold' };
}

/**
 * League table / leaderboard: rank, entity, a few numeric stat columns, an optional movement
 * arrow. `table-auto` lets stat columns size to their content with `whitespace-nowrap` (so
 * "0.53%" reads apart and headers never truncate to "W…"); only the entity name truncates.
 * Plain DOM → natural height. Ink-on-paper only.
 */
export function StandingsTable({ graphic, table, caption }: { graphic: Standings; table: TTableData; caption: string }) {
  const { entityColumn, rankColumn, movementColumn } = graphic;
  const statColumns = graphic.statColumns.slice(0, MAX_STATS);
  const rows = table.rows.slice(0, MAX_ROWS);
  const extra = table.rows.length - rows.length;
  // Tighten when there are many stat columns so the whole table still fits a ~262px column
  // (the figure clips overflow, so fitting here is what stops a right-edge/spine cut-off).
  const dense = statColumns.length >= 4;
  const cellPad = dense ? 'px-0.5' : 'px-1';
  const statUnit = Object.fromEntries(statColumns.map((c) => [c, detectColumnUnit(table, c)]));
  return (
    <GraphicFigure>
      <table className={`w-full table-auto border-collapse ${dense ? 'text-[9px]' : 'text-[10px]'}`}>
        <caption className="mb-1 text-left text-[11px] font-semibold italic">{caption}</caption>
        <thead>
          <tr>
            <th className={`border-b-2 border-black ${cellPad} py-0.5 text-left font-bold`}>#</th>
            <th className={`max-w-[72px] truncate border-b-2 border-black ${cellPad} py-0.5 text-left font-bold`} title={entityColumn}>{shortLabel(entityColumn, 14)}</th>
            {statColumns.map((c) => (
              <th key={c} className={`max-w-[44px] truncate border-b-2 border-black ${cellPad} py-0.5 text-right font-bold tabular-nums`} title={c}>{shortLabel(c, 6)}</th>
            ))}
            {movementColumn && <th className={`border-b-2 border-black ${cellPad} py-0.5 text-right font-bold`}>+/–</th>}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, r) => (
            <tr key={r} className="border-b border-black/30">
              <td className={`${cellPad} py-0.5 font-bold tabular-nums`}>{rankColumn ? cell(table, row, rankColumn) : r + 1}</td>
              <td className={`max-w-[72px] truncate ${cellPad} py-0.5`} title={cell(table, row, entityColumn)}>{cell(table, row, entityColumn)}</td>
              {statColumns.map((c) => (
                <td key={c} className={`max-w-[52px] truncate ${cellPad} py-0.5 text-right tabular-nums`} title={cell(table, row, c)}>{formatCell(cell(table, row, c), statUnit[c])}</td>
              ))}
              {movementColumn && (
                <td className={`whitespace-nowrap px-1 py-0.5 text-right tabular-nums ${movement(cell(table, row, movementColumn)).weight}`}>
                  {movement(cell(table, row, movementColumn)).glyph}
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
      {extra > 0 && <p className="mt-1 text-[9px] italic text-black/50">+{extra} more</p>}
    </GraphicFigure>
  );
}
