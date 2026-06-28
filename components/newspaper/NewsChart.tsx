'use client';
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import type { TChartSpec, TTableData } from '@/lib/schema';
import { chartData } from '@/lib/newspaper/chartSpec';
import { colValues } from '@/lib/newspaper/tableShape';
import { dateAxisFormatter, primarySeries, shortLabel, withUnit } from '@/lib/newspaper/format';
import { CHART_H, CHART_W } from '@/lib/newspaper/leafLayout';
import { GraphicFigure } from './GraphicFigure';

// Newsprint palette: ink + greys (grayscale, so it survives the B&W toggle unchanged) and
// dash patterns, so multiple series read apart WITHOUT colour. No chart chrome / gridlines.
const INK = ['#141414', '#5b5b5b', '#8c8c8c', '#b6b6b6'];
const DASH = ['', '5 3', '2 3', '7 3 2 3'];

// Module-level so it isn't re-created each render. recharts clones the `content` element,
// injecting active/payload/label; `unit` is passed through explicitly for formatting.
function ChartTooltip({
  active,
  payload,
  label,
  unit,
  labelFmt,
}: {
  active?: boolean;
  payload?: Array<{ name?: string; value?: number; dataKey?: string }>;
  label?: string | number;
  unit?: string;
  labelFmt?: (raw: string | number) => string;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div style={{ background: 'var(--paper, #f4efe4)', border: '1px solid #141414', padding: '3px 6px', fontSize: 10, lineHeight: 1.3 }}>
      <div style={{ fontWeight: 700 }}>{label != null ? (labelFmt ? labelFmt(label) : label) : ''}</div>
      {payload.map((p) => (
        <div key={p.dataKey}>
          {p.name}: {withUnit(Number(p.value), unit)}
        </div>
      ))}
    </div>
  );
}

type Props = {
  chart: TChartSpec;
  table: TTableData;
  caption: string;
  width?: number;
  height?: number;
  className?: string;
  /** Draw the chart in (recharts animation). Off by default so the paginator measures a
   *  stable height; the initial-generation reveal turns it on so charts visibly build in. */
  animate?: boolean;
};

/**
 * Draws an article's `table` as an interactive, newsprint-styled chart (recharts). Sized to
 * a FIXED width/height so a chart block measures identically in the paginator's hidden pass
 * and the real leaf — no load-tall-then-snap reflow. Always ink-on-paper monochrome, so the
 * B&W toggle leaves it legible. Animation is off by default (deterministic measurement).
 */
export function NewsChart({ chart, table, caption, width = CHART_W, height = CHART_H, className, animate = false }: Props) {
  // Plot only a single comparable scale: a mixed price/percent pair on one Y-axis would draw
  // the small series as an unreadable flat line, so the odd group is dropped (and noted below).
  const series = primarySeries(table, chart.valueColumns);
  const dropped = series.length < chart.valueColumns.length;
  const data = chartData(table, { ...chart, valueColumns: series });
  // ISO timestamps → "Jan 7" / "14:00"; the whole axis picks one granularity that fits.
  const fmtX = dateAxisFormatter(colValues(table, chart.labelColumn));

  const axisTick = { fontSize: 9, fill: '#222' };
  // Right margin reserves room for the LAST x-axis tick label so it sits inside the plot
  // instead of being clipped at the figure's edge.
  const margin = { top: 6, right: 16, left: 0, bottom: 0 };
  const common = { width, height, data, margin } as const;

  const grid = <CartesianGrid stroke="rgba(0,0,0,0.12)" vertical={false} />;
  const xAxis = (
    <XAxis
      dataKey={chart.labelColumn}
      tick={axisTick}
      tickLine={false}
      axisLine={{ stroke: '#141414' }}
      interval="preserveStartEnd"
      minTickGap={16}
      tickFormatter={fmtX}
    />
  );
  const yAxis = (
    <YAxis
      tick={axisTick}
      tickLine={false}
      axisLine={{ stroke: '#141414' }}
      width={36}
      tickFormatter={(v) => withUnit(Number(v), chart.unit)}
    />
  );
  const tooltip = (
    <Tooltip content={<ChartTooltip unit={chart.unit} labelFmt={fmtX} />} cursor={{ fill: 'rgba(0,0,0,0.06)', stroke: 'rgba(0,0,0,0.2)' }} />
  );
  const legend = series.length > 1 ? <Legend wrapperStyle={{ fontSize: 9 }} iconSize={8} /> : null;

  let inner;
  if (chart.type === 'bar') {
    inner = (
      <BarChart {...common}>
        {grid}{xAxis}{yAxis}{tooltip}{legend}
        {series.map((c, i) => (
          <Bar key={c} name={shortLabel(c)} dataKey={c} fill={INK[i % INK.length]} isAnimationActive={animate} />
        ))}
      </BarChart>
    );
  } else if (chart.type === 'area') {
    inner = (
      <AreaChart {...common}>
        {grid}{xAxis}{yAxis}{tooltip}{legend}
        {series.map((c, i) => (
          <Area
            key={c}
            name={shortLabel(c)}
            type="monotone"
            dataKey={c}
            stroke="#141414"
            strokeWidth={1.5}
            strokeDasharray={DASH[i % DASH.length]}
            fill={INK[i % INK.length]}
            fillOpacity={0.14}
            isAnimationActive={animate}
          />
        ))}
      </AreaChart>
    );
  } else {
    inner = (
      <LineChart {...common}>
        {grid}{xAxis}{yAxis}{tooltip}{legend}
        {series.map((c, i) => (
          <Line
            key={c}
            name={shortLabel(c)}
            type="monotone"
            dataKey={c}
            dot={false}
            stroke="#141414"
            strokeWidth={1.4}
            strokeDasharray={DASH[i % DASH.length]}
            isAnimationActive={animate}
          />
        ))}
      </LineChart>
    );
  }

  // Be honest when an incompatible series was dropped for legibility.
  const fullCaption = dropped ? `${caption} · showing ${shortLabel(series[0])}` : caption;

  return (
    <GraphicFigure caption={fullCaption} className={className}>
      <div className="overflow-hidden" style={{ width, height }}>
        {inner}
      </div>
    </GraphicFigure>
  );
}
