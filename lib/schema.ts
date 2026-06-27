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

// How to draw `table` as an interactive chart. `labelColumn`/`valueColumns` name
// columns that MUST exist in the article's table; this is validated/repaired in
// lib/newspaper/chartSpec.ts before it ever reaches the renderer.
export const ChartSpec = z.object({
  type: z.enum(['line', 'bar', 'area']),
  labelColumn: z.string(),
  valueColumns: z.array(z.string()).min(1),
  unit: z.string().optional(),
});

export const Article = z.object({
  kicker: z.string(),
  headline: z.string(),
  dek: z.string().optional(),
  byline: z.string().default('Tako Wire'),
  body: z.string(),
  size: z.enum(['lead', 'standard', 'brief']),
  // Visuals are React charts built from `table` (no Tako PNGs). When the research carries
  // numbers, the article ships a `table` + a `chart` spec describing how to draw it.
  table: TableData.optional(),
  chart: ChartSpec.optional(),
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
export type TArticle = z.infer<typeof Article>;
export type TPage = z.infer<typeof Page>;
export type TNewspaper = z.infer<typeof Newspaper>;
export type TSectionPlan = z.infer<typeof SectionPlan>;
