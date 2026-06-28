'use client';
import { CartesianGrid, Scatter, ScatterChart, Tooltip, XAxis, YAxis, ZAxis } from 'recharts';
import type { TGraphic, TTableData } from '@/lib/schema';
import { parseNumeric } from '@/lib/newspaper/tableShape';
import { formatLabel, shortLabel, withUnit } from '@/lib/newspaper/format';
import { CHART_H, CHART_W } from '@/lib/newspaper/leafLayout';
import { GraphicFigure } from './GraphicFigure';

type ScatterSpec = Extract<TGraphic, { kind: 'scatter' }>;

const cell = (table: TTableData, row: string[], col: string): string => row[table.columns.indexOf(col)] ?? '';

function ScatterTooltip({
  active,
  payload,
  spec,
}: {
  active?: boolean;
  payload?: Array<{ payload?: { x: number; y: number; label?: string } }>;
  spec: ScatterSpec;
}) {
  const p = payload?.[0]?.payload;
  if (!active || !p) return null;
  return (
    <div style={{ background: 'var(--paper, #f4efe4)', border: '1px solid #141414', padding: '3px 6px', fontSize: 10, lineHeight: 1.3 }}>
      {p.label && <div style={{ fontWeight: 700 }}>{formatLabel(p.label)}</div>}
      <div>{shortLabel(spec.xColumn)}: {withUnit(p.x, spec.unit)}</div>
      <div>{shortLabel(spec.yColumn)}: {withUnit(p.y, spec.unit)}</div>
    </div>
  );
}

/**
 * Two-variable correlation plot (recharts), newsprint-styled like NewsChart: ink dots, no
 * colour, FIXED width/height so it measures identically in the paginator's hidden pass and
 * the real leaf. Animation off by default for stable measurement.
 */
export function ScatterPlot({
  graphic,
  table,
  caption,
  width = CHART_W,
  height = CHART_H,
  className,
  animate = false,
}: {
  graphic: ScatterSpec;
  table: TTableData;
  caption: string;
  width?: number;
  height?: number;
  className?: string;
  animate?: boolean;
}) {
  const data = table.rows
    .map((row) => ({
      x: parseNumeric(cell(table, row, graphic.xColumn)),
      y: parseNumeric(cell(table, row, graphic.yColumn)),
      label: graphic.labelColumn ? cell(table, row, graphic.labelColumn) : undefined,
    }))
    .filter((p): p is { x: number; y: number; label: string | undefined } => p.x !== null && p.y !== null);

  const axisTick = { fontSize: 9, fill: '#222' };
  return (
    <GraphicFigure caption={caption} className={className}>
      <div className="overflow-hidden" style={{ width, height }}>
        <ScatterChart width={width} height={height} margin={{ top: 6, right: 16, left: 0, bottom: 2 }} data={data}>
          <CartesianGrid stroke="rgba(0,0,0,0.12)" />
          <XAxis
            type="number"
            dataKey="x"
            name={graphic.xColumn}
            tick={axisTick}
            tickLine={false}
            axisLine={{ stroke: '#141414' }}
            tickFormatter={(v) => withUnit(Number(v), graphic.unit)}
          />
          <YAxis
            type="number"
            dataKey="y"
            name={graphic.yColumn}
            tick={axisTick}
            tickLine={false}
            axisLine={{ stroke: '#141414' }}
            width={36}
            tickFormatter={(v) => withUnit(Number(v), graphic.unit)}
          />
          <ZAxis range={[28, 28]} />
          <Tooltip content={<ScatterTooltip spec={graphic} />} cursor={{ stroke: 'rgba(0,0,0,0.2)' }} />
          <Scatter data={data} fill="#141414" isAnimationActive={animate} />
        </ScatterChart>
      </div>
    </GraphicFigure>
  );
}
