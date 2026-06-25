import { MAX_TABLE_ROWS } from '@/lib/config';
import type { TTableData } from '@/lib/schema';

function parseCsv(csv: string): string[][] {
  const rows: string[][] = [];
  let field = '';
  let row: string[] = [];
  let inQuotes = false;

  for (let i = 0; i < csv.length; i++) {
    const c = csv[i];
    if (inQuotes) {
      if (c === '"') {
        if (csv[i + 1] === '"') { field += '"'; i++; }
        else inQuotes = false;
      } else field += c;
    } else if (c === '"') {
      inQuotes = true;
    } else if (c === ',') {
      row.push(field); field = '';
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && csv[i + 1] === '\n') i++;
      row.push(field); field = '';
      rows.push(row); row = [];
    } else field += c;
  }
  if (field !== '' || row.length > 0) { row.push(field); rows.push(row); }
  return rows.filter((r) => r.some((cell) => cell.trim() !== ''));
}

export function csvToTable(
  csv: string,
  caption: string,
  maxRows: number = MAX_TABLE_ROWS,
): TTableData | undefined {
  if (!csv || csv.trim() === '') return undefined;
  const parsed = parseCsv(csv);
  if (parsed.length < 2) return undefined;
  const [columns, ...body] = parsed;
  if (columns.length === 0) return undefined;
  return { caption, columns, rows: body.slice(0, maxRows) };
}
