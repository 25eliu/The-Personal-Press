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
import { CHART_H, CHART_W } from '@/lib/newspaper/leafLayout';

// Newsprint palette: ink + greys (grayscale, so it survives the B&W toggle unchanged) and
// dash patterns, so multiple series read apart WITHOUT colour. No chart chrome / gridlines.
const INK = ['#141414', '#5b5b5b', '#8c8c8c', '#b6b6b6'];
const DASH = ['', '5 3', '2 3', '7 3 2 3'];

function abbr(n: number): string {
  const a = Math.abs(n);
  if (a >= 1e9) return `${(n / 1e9).toFixed(1)}B`;
  if (a >= 1e6) return `${(n / 1e6).toFixed(1)}M`;
  if (a >= 1e3) return `${(n / 1e3).toFixed(1)}k`;
  return `${Math.round(n * 100) / 100}`;
}
function withUnit(n: number, unit?: string): string {
  if (unit === '%') return `${abbr(n)}%`;
  if (unit === '$') return `$${abbr(n)}`;
  return abbr(n);
}

// Module-level so it isn't re-created each render. recharts clones the `content` element,
// injecting active/payload/label; `unit` is passed through explicitly for formatting.
function ChartTooltip({
  active,
  payload,
  label,
  unit,
}: {
  active?: boolean;
  payload?: Array<{ name?: string; value?: number; dataKey?: string }>;
  label?: string | number;
  unit?: string;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div style={{ background: 'var(--paper, #f4efe4)', border: '1px solid #141414', padding: '3px 6px', fontSize: 10, lineHeight: 1.3 }}>
      <div style={{ fontWeight: 700 }}>{label}</div>
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
  const data = chartData(table, chart);
  const axisTick = { fontSize: 9, fill: '#222' };
  const margin = { top: 6, right: 8, left: 0, bottom: 0 };
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
    <Tooltip content={<ChartTooltip unit={chart.unit} />} cursor={{ fill: 'rgba(0,0,0,0.06)', stroke: 'rgba(0,0,0,0.2)' }} />
  );
  const legend = chart.valueColumns.length > 1 ? <Legend wrapperStyle={{ fontSize: 9 }} iconSize={8} /> : null;

  let inner;
  if (chart.type === 'bar') {
    inner = (
      <BarChart {...common}>
        {grid}{xAxis}{yAxis}{tooltip}{legend}
        {chart.valueColumns.map((c, i) => (
          <Bar key={c} dataKey={c} fill={INK[i % INK.length]} isAnimationActive={animate} />
        ))}
      </BarChart>
    );
  } else if (chart.type === 'area') {
    inner = (
      <AreaChart {...common}>
        {grid}{xAxis}{yAxis}{tooltip}{legend}
        {chart.valueColumns.map((c, i) => (
          <Area
            key={c}
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
        {chart.valueColumns.map((c, i) => (
          <Line
            key={c}
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

  return (
    <figure className={`border border-black/80 p-1 ${className ?? ''}`}>
      <div className="overflow-hidden" style={{ width, height }}>
        {inner}
      </div>
      <figcaption className="mt-1 text-[10px] italic leading-snug">{caption}</figcaption>
    </figure>
  );
}
