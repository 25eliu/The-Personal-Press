import { z } from 'zod';

export const Source = z.object({
  name: z.string(),
  url: z.string().url().optional(),
});

export const TableData = z.object({
  caption: z.string(),
  columns: z.array(z.string()),
  rows: z.array(z.array(z.string())),
});

export const Article = z.object({
  kicker: z.string(),
  headline: z.string(),
  dek: z.string().optional(),
  byline: z.string().default('Tako Wire'),
  body: z.string(),
  size: z.enum(['lead', 'standard', 'brief']),
  chartImageUrl: z.string().url().optional(),
  chartEmbedUrl: z.string().url().optional(),
  table: TableData.optional(),
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
export type TArticle = z.infer<typeof Article>;
export type TPage = z.infer<typeof Page>;
export type TNewspaper = z.infer<typeof Newspaper>;
export type TSectionPlan = z.infer<typeof SectionPlan>;
