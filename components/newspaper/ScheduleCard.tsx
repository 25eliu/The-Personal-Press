import type { TGraphic, TTableData } from '@/lib/schema';
import { formatWhen } from '@/lib/newspaper/format';
import { GraphicFigure } from './GraphicFigure';

type Schedule = Extract<TGraphic, { kind: 'schedule' }>;

const cell = (table: TTableData, row: string[], col: string): string => row[table.columns.indexOf(col)] ?? '';

// A printed schedule is a short list — cap rows so it can never spill past the page edge.
const MAX_ROWS = 10;

/**
 * Fixtures / events list — upcoming matches, an earnings calendar, a programme of events.
 * The natural home for Tako schedule content (date/time + what's happening), which has no
 * sensible chart form. `list-none` (no stray browser bullets), short "when" labels, capped
 * rows, and truncated titles keep it tidy inside the column. Plain DOM, ink-on-paper.
 */
export function ScheduleCard({ graphic, table, caption }: { graphic: Schedule; table: TTableData; caption: string }) {
  const { whenColumn, titleColumn, detailColumn, statusColumn } = graphic;
  const rows = table.rows.slice(0, MAX_ROWS);
  const extra = table.rows.length - rows.length;
  return (
    <GraphicFigure caption={caption}>
      <ul className="list-none divide-y divide-black/15">
        {rows.map((row, r) => (
          <li key={r} className="flex items-baseline gap-2 py-0.5">
            <span className="w-14 shrink-0 truncate font-mono-news text-[9px] uppercase tracking-wide text-black/70">
              {formatWhen(cell(table, row, whenColumn))}
            </span>
            <span className="min-w-0 flex-1 truncate">
              <span className="text-[11px] font-semibold leading-tight">{cell(table, row, titleColumn)}</span>
              {detailColumn && (
                <span className="ml-1 text-[10px] text-black/60">{cell(table, row, detailColumn)}</span>
              )}
            </span>
            {statusColumn && (
              <span className="shrink-0 truncate text-[9px] uppercase tracking-wide text-black/55">{cell(table, row, statusColumn)}</span>
            )}
          </li>
        ))}
      </ul>
      {extra > 0 && <p className="mt-1 text-[9px] italic text-black/50">+{extra} more</p>}
    </GraphicFigure>
  );
}
