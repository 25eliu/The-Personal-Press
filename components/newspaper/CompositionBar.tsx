import type { TGraphic, TTableData } from '@/lib/schema';
import { parseNumeric } from '@/lib/newspaper/tableShape';
import { formatLabel } from '@/lib/newspaper/format';
import { CHART_W } from '@/lib/newspaper/leafLayout';
import { GraphicFigure } from './GraphicFigure';

type Composition = Extract<TGraphic, { kind: 'composition' }>;

const cell = (table: TTableData, row: string[], col: string): string => row[table.columns.indexOf(col)] ?? '';

// Monochrome fills: a solid ink, then SVG hatch patterns (referenced by id) so parts read
// apart with NO colour — the composition equivalent of NewsChart's dash patterns. Survives
// the B&W toggle unchanged.
const FILLS = ['#141414', 'url(#hatch-a)', 'url(#hatch-b)', 'url(#hatch-c)', 'url(#hatch-d)', '#8c8c8c'];
const MAX_SEGMENTS = 6;

const Hatches = () => (
  <defs>
    {/* tile bg = light grey so the ink strokes carry the contrast in print */}
    <pattern id="hatch-a" width="5" height="5" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
      <rect width="5" height="5" fill="#d9d4c6" />
      <line x1="0" y1="0" x2="0" y2="5" stroke="#141414" strokeWidth="1.6" />
    </pattern>
    <pattern id="hatch-b" width="5" height="5" patternUnits="userSpaceOnUse" patternTransform="rotate(-45)">
      <rect width="5" height="5" fill="#cfc9ba" />
      <line x1="0" y1="0" x2="0" y2="5" stroke="#141414" strokeWidth="1.4" />
    </pattern>
    <pattern id="hatch-c" width="4" height="4" patternUnits="userSpaceOnUse">
      <rect width="4" height="4" fill="#e2ddcf" />
      <line x1="0" y1="0" x2="0" y2="4" stroke="#141414" strokeWidth="1.2" />
    </pattern>
    <pattern id="hatch-d" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
      <rect width="6" height="6" fill="#bdb7a7" />
      <line x1="0" y1="0" x2="6" y2="0" stroke="#141414" strokeWidth="1" />
      <line x1="0" y1="0" x2="0" y2="6" stroke="#141414" strokeWidth="1" />
    </pattern>
  </defs>
);

type Seg = { label: string; value: number; pct: number; offsetPct: number; fill: string };

function segments(graphic: Composition, table: TTableData): Seg[] {
  const raw = table.rows
    .map((row) => ({ label: formatLabel(cell(table, row, graphic.labelColumn)), value: parseNumeric(cell(table, row, graphic.valueColumn)) ?? 0 }))
    .filter((s) => s.value > 0);
  // Keep the largest slices; roll the rest into a single "Other" so the bar stays legible.
  raw.sort((a, b) => b.value - a.value);
  const head = raw.slice(0, MAX_SEGMENTS - 1);
  const tail = raw.slice(MAX_SEGMENTS - 1);
  const merged = tail.length
    ? [...head, { label: 'Other', value: tail.reduce((n, s) => n + s.value, 0) }]
    : head.length
      ? head
      : raw;
  const total = merged.reduce((n, s) => n + s.value, 0) || 1;
  // Pre-accumulate each slice's left offset so the render is a pure map (no mutation).
  let acc = 0;
  return merged.map((s, i) => {
    const pct = (s.value / total) * 100;
    const offsetPct = acc;
    acc += pct;
    return { ...s, pct, offsetPct, fill: FILLS[i % FILLS.length] };
  });
}

/**
 * Parts-of-whole as a single 100% stacked bar with a labelled legend — market share, vote
 * share, budget breakdown. Uses SVG hatch fills (not colour) so each slice reads apart in
 * black & white. Plain SVG/DOM → natural height in the paginator.
 */
export function CompositionBar({ graphic, table, caption }: { graphic: Composition; table: TTableData; caption: string }) {
  const segs = segments(graphic, table);
  const W = CHART_W;
  const H = 22;
  return (
    <GraphicFigure caption={caption}>
      <svg width={W} height={H} className="block max-w-full" role="img" aria-label={caption}>
        <Hatches />
        {segs.map((s, i) => (
          <rect
            key={i}
            x={(s.offsetPct / 100) * W}
            y={0}
            width={(s.pct / 100) * W}
            height={H}
            fill={s.fill}
            stroke="#141414"
            strokeWidth={0.75}
          />
        ))}
      </svg>
      <ul className="mt-1.5 grid grid-cols-2 gap-x-3 gap-y-0.5">
        {segs.map((s, i) => (
          <li key={i} className="flex items-center gap-1 text-[10px] leading-tight">
            <svg width="9" height="9" className="shrink-0">
              <Hatches />
              <rect width="9" height="9" fill={s.fill} stroke="#141414" strokeWidth={0.75} />
            </svg>
            <span className="min-w-0 truncate">{s.label}</span>
            <span className="ml-auto shrink-0 tabular-nums font-semibold">{Math.round(s.pct)}%</span>
          </li>
        ))}
      </ul>
    </GraphicFigure>
  );
}
