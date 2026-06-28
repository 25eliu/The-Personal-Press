import { z } from 'zod';

// NOTE: URL fields are plain strings, NOT z.string().url(). zod v4's .url() emits
// JSON Schema `format: "uri"`, which OpenAI structured-output strict mode rejects
// ("'uri' is not a valid format"). http(s) validity is enforced at runtime instead
// by validUrl()/sanitizePage() in lib/tako, which run on every distilled page.
export const Source = z.object({
  name: z.string(),
  url: z.string().optional(),
});

export const TableData = z.object({
  caption: z.string(),
  columns: z.array(z.string()),
  rows: z.array(z.array(z.string())),
});

// How to draw `table` as an interactive line/bar/area chart. `labelColumn`/`valueColumns`
// name columns that MUST exist in the article's table; this is validated/repaired in
// lib/newspaper/chartSpec.ts before it ever reaches the renderer. ChartSpec is BOTH the
// model-facing chart hint (DraftArticle.chart) and the internals of the `chart` Graphic.
export const ChartSpec = z.object({
  type: z.enum(['line', 'bar', 'area']),
  labelColumn: z.string(),
  valueColumns: z.array(z.string()).min(1),
  unit: z.string().optional(),
});

// A Graphic is the app-facing description of HOW to draw an article's shared `table`.
// One data path (the table), many renderings — the router (lib/newspaper/graphic.ts)
// picks the kind from the data shape; the renderer (GraphicView) dispatches on `kind`.
// Every column field below MUST name a column that exists in the article's table.
const ChartGraphic = ChartSpec.extend({ kind: z.literal('chart') });

const ScatterGraphic = z.object({
  kind: z.literal('scatter'),
  xColumn: z.string(),
  yColumn: z.string(),
  labelColumn: z.string().optional(),
  unit: z.string().optional(),
});

const CompositionGraphic = z.object({
  kind: z.literal('composition'),
  labelColumn: z.string(),
  valueColumn: z.string(),
  unit: z.string().optional(),
});

const StandingsGraphic = z.object({
  kind: z.literal('standings'),
  entityColumn: z.string(),
  statColumns: z.array(z.string()).min(1),
  rankColumn: z.string().optional(),
  movementColumn: z.string().optional(),
});

const StatGraphic = z.object({
  kind: z.literal('stat'),
  labelColumn: z.string(),
  valueColumns: z.array(z.string()).min(1),
  unit: z.string().optional(),
  deltaColumn: z.string().optional(),
});

const ScheduleGraphic = z.object({
  kind: z.literal('schedule'),
  whenColumn: z.string(),
  titleColumn: z.string(),
  detailColumn: z.string().optional(),
  statusColumn: z.string().optional(),
});

export const Graphic = z.discriminatedUnion('kind', [
  ChartGraphic,
  ScatterGraphic,
  CompositionGraphic,
  StandingsGraphic,
  StatGraphic,
  ScheduleGraphic,
]);

export const GRAPHIC_KINDS = ['chart', 'scatter', 'composition', 'standings', 'stat', 'schedule'] as const;

// --- App-facing article/page (what state, blocks, components, and the copilot use) ----
// Visuals are React graphics drawn from `table` (no Tako PNGs). When the research carries
// numbers, the article ships a `table` + a `graphic` describing how to draw it.
export const Article = z.object({
  kicker: z.string(),
  headline: z.string(),
  dek: z.string().optional(),
  byline: z.string().default('Tako Wire'),
  body: z.string(),
  size: z.enum(['lead', 'standard', 'brief']),
  table: TableData.optional(),
  graphic: Graphic.optional(),
  sources: z.array(Source).min(1),
});

export const Page = z.object({
  topic: z.string(),
  articles: z.array(Article),
});

export const Newspaper = z.object({
  masthead: z.string(),
  tagline: z.string(),
  edition: z.string(),
  dateLine: z.string(),
  pages: z.array(Page),
});

// --- Model-facing draft (what the reporter LLM emits) ---------------------------------
// The distill model keeps producing today's `table` + optional `chart` hint — a flat,
// strict-schema-friendly shape, NO discriminated union. lib/agents/reporter.ts converts a
// DraftPage into an app Page by running the router over each table (chart hint included).
export const DraftArticle = z.object({
  kicker: z.string(),
  headline: z.string(),
  dek: z.string().optional(),
  byline: z.string().default('Tako Wire'),
  body: z.string(),
  size: z.enum(['lead', 'standard', 'brief']),
  table: TableData.optional(),
  chart: ChartSpec.optional(),
  sources: z.array(Source).min(1),
});

export const DraftPage = z.object({
  topic: z.string(),
  articles: z.array(DraftArticle),
});

export const SectionPlan = z.object({
  masthead: z.string(),
  tagline: z.string(),
  edition: z.string(),
  dateLine: z.string(),
  sections: z.array(z.object({ topic: z.string() })).min(1).max(5),
});

export type TSource = z.infer<typeof Source>;
export type TTableData = z.infer<typeof TableData>;
export type TChartSpec = z.infer<typeof ChartSpec>;
export type TGraphic = z.infer<typeof Graphic>;
export type TGraphicKind = (typeof GRAPHIC_KINDS)[number];
export type TArticle = z.infer<typeof Article>;
export type TPage = z.infer<typeof Page>;
export type TNewspaper = z.infer<typeof Newspaper>;
export type TDraftArticle = z.infer<typeof DraftArticle>;
export type TDraftPage = z.infer<typeof DraftPage>;
export type TSectionPlan = z.infer<typeof SectionPlan>;
