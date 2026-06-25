import type { TTableData } from '@/lib/schema';

export function DataTable({ table }: { table: TTableData }) {
  return (
    <div className="my-2">
      <table className="w-full border-collapse text-[11px]">
        <caption className="mb-1 text-left text-[11px] font-semibold italic">{table.caption}</caption>
        <thead>
          <tr>
            {table.columns.map((c, i) => (
              <th key={i} className="border-b-2 border-black px-1 py-0.5 text-left font-bold">{c}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {table.rows.map((row, r) => (
            <tr key={r} className="border-b border-black/30">
              {row.map((cell, c) => (
                <td key={c} className="px-1 py-0.5">{cell}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
