import type { TTableData } from '@/lib/schema';
import { colValues, detectColumnUnit, isNumericColumn, looksLikeDates } from '@/lib/newspaper/tableShape';
import { formatCell, formatLabel, shortLabel } from '@/lib/newspaper/format';
import { capRows } from '@/lib/newspaper/graphicModal';

// The plain-table fallback must stay readable, never a 30-row monster: cap rows and let cells
// truncate so columns never overlap. The modal overrides `maxRows` with Infinity to show every row.
const MAX_ROWS = 8;

export function DataTable({ table, maxRows = MAX_ROWS }: { table: TTableData; maxRows?: number }) {
  const { shown: rows, extra } = capRows(table.rows, maxRows);
  // Decide each column's rendering once: numeric cells get rounded/abbreviated + their unit,
  // date columns collapse ISO timestamps, everything else prints as-is.
  const col = table.columns.map((c) => ({
    numeric: isNumericColumn(table, c),
    dated: looksLikeDates(colValues(table, c)),
    unit: detectColumnUnit(table, c),
  }));
  const fmt = (value: string, c: number) =>
    col[c]?.numeric ? formatCell(value, col[c].unit) : col[c]?.dated ? formatLabel(value) : value;
  return (
    <div className="my-2 overflow-hidden">
      {/* table-fixed: columns divide the column width evenly and truncate, so a wide table
          always fits and never bleeds past the column edge into the spine. */}
      <table className="w-full table-fixed border-collapse text-[11px]">
        <caption className="mb-1 text-left text-[11px] font-semibold italic">{table.caption}</caption>
        <thead>
          <tr>
            {table.columns.map((c, i) => (
              <th key={i} className="truncate border-b-2 border-black px-1 py-0.5 text-left font-bold" title={c}>{shortLabel(c)}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, r) => (
            <tr key={r} className="border-b border-black/30">
              {row.map((cellv, c) => (
                <td key={c} className="truncate px-1 py-0.5" title={cellv}>{fmt(cellv, c)}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      {extra > 0 && <p className="mt-1 text-[9px] italic text-black/50">+{extra} more rows</p>}
    </div>
  );
}
