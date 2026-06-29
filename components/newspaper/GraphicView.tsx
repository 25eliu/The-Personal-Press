import type { TGraphic, TTableData } from '@/lib/schema';
import { NewsChart } from './NewsChart';
import { ScatterPlot } from './ScatterPlot';
import { CompositionBar } from './CompositionBar';
import { StandingsTable } from './StandingsTable';
import { StatCallout } from './StatCallout';
import { ScheduleCard } from './ScheduleCard';
import { ExpandableGraphic } from './GraphicModal';

/**
 * The single dispatcher for an article's graphic: given the shared `table` and the chosen
 * `graphic` spec, render the matching premade component. Every consumer (the printed leaf,
 * the live-edit reload, the copilot chat preview) goes through here, so adding a kind means
 * adding one case — nothing else branches on graphic.kind.
 */
export function GraphicView({
  graphic,
  table,
  caption,
  width,
  height,
  animate = false,
  className,
  expandable = false,
}: {
  graphic: TGraphic;
  table: TTableData;
  caption: string;
  width?: number;
  height?: number;
  animate?: boolean;
  className?: string;
  expandable?: boolean;
}) {
  const figure = renderGraphic();
  if (!expandable || figure === null) return figure;
  return (
    <ExpandableGraphic graphic={graphic} table={table} caption={caption}>
      {figure}
    </ExpandableGraphic>
  );

  function renderGraphic() {
    switch (graphic.kind) {
      case 'chart':
        return (
          <NewsChart
            chart={{ type: graphic.type, labelColumn: graphic.labelColumn, valueColumns: graphic.valueColumns, unit: graphic.unit }}
            table={table}
            caption={caption}
            width={width}
            height={height}
            animate={animate}
            className={className}
          />
        );
      case 'scatter':
        return (
          <ScatterPlot graphic={graphic} table={table} caption={caption} width={width} height={height} animate={animate} className={className} />
        );
      case 'composition':
        return <CompositionBar graphic={graphic} table={table} caption={caption} />;
      case 'standings':
        return <StandingsTable graphic={graphic} table={table} caption={caption} />;
      case 'stat':
        return <StatCallout graphic={graphic} table={table} caption={caption} />;
      case 'schedule':
        return <ScheduleCard graphic={graphic} table={table} caption={caption} />;
      default:
        return null;
    }
  }
}
