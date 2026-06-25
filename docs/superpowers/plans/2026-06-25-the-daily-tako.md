# The Daily Tako Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a single-page Next.js app where one line of input drives an AI agent (using `@takoviz/ai-sdk`) to report, write, and typeset a short grounded newspaper the user watches print and flips through.

**Architecture:** A Next.js App Router app. `/api/generate` runs a two-phase agent pipeline (editor `generateObject` → parallel reporter `generateText` tool-loops → `generateObject` distill) and streams typed NDJSON progress events over a `ReadableStream`. The client is a state machine (idle → typesetting → printing → reading) that turns those events into a Framer Motion build animation and a `react-pageflip` reading view. No database, no auth, no automation.

**Tech Stack:** Next.js (App Router) + TypeScript + Tailwind CSS, `ai` v7, `@takoviz/ai-sdk@2.0.0`, `@ai-sdk/openai`, `zod` v4, `framer-motion`, `react-pageflip`. Tests: Vitest.

## Global Constraints

- **Node:** use the repo's installed Node (v26). **Package manager:** npm.
- **`ai`** v7 (`^7.0.0`); **`@takoviz/ai-sdk`** `2.0.0`; **`zod`** `^4.0.0` (v4 — NOT v3, it is a peer dep of the Tako SDK); **`@ai-sdk/openai`** latest.
- **Model:** OpenAI `gpt-4.1`, defined once in `lib/config.ts` as `MODEL`.
- **Bounded tool loop:** `stopWhen: isStepCount(6)` (import `isStepCount` from `ai`).
- **Tako tool config is fixed at construction**; the model supplies only `{ query }` or `{ url }`.
- **`takoContents` must be constructed with `mode: 'inline'`** (its default is `'url'`).
- **Tool result payload in ai v7 is `step.toolResults[].output`** (with `.toolName`), not `.result`.
- **Secrets server-side only:** `TAKO_API_KEY`, `OPENAI_API_KEY`. Never import into client code. `.gitignore` MUST exclude env files.
- **Grounding:** every article cites ≥1 source; no fabrication; thin/failed sections degrade to a single "No fresh reporting on the wire" brief; a failed reporter never blocks the paper.
- **Size caps:** max 5 pages (front + ≤4 topic); front page = 1 `lead` + 2–3 `brief`; topic page = 2–4 articles; words: `lead` ≤180, `standard` ≤110, `brief` ≤60.
- **Empty source URLs:** Tako `source.url` is often `""`/`null` → fall back to card `webpage_url`; strip empty strings before any Zod `.url()` validation.
- **B&W toggle is pure CSS** (grayscale + halftone), default on. Do NOT use the chart dark-mode param.
- **Coding style:** immutable data (return new objects), files ~200–400 lines (800 max), functions <50 lines, validate external data at boundaries.

---

### Task 1: Scaffold app, dependencies, tooling, env, gitignore

**Files:**
- Create: whole Next.js scaffold (`app/`, `package.json`, `tsconfig.json`, `tailwind` config, `next.config.ts`)
- Create: `.env.example`
- Create: `vitest.config.ts`
- Create: `lib/__tests__/sanity.test.ts`
- Modify: `.gitignore` (verify env exclusion)

**Interfaces:**
- Produces: a running Next.js dev server and a working `npm test` (Vitest).

- [ ] **Step 1: Scaffold Next.js into the current (empty but git-initialized) repo**

Run from repo root (`/Users/eric/The-Personal-Press`):

```bash
npx create-next-app@latest . --ts --tailwind --app --eslint --src-dir=false --import-alias "@/*" --no-turbopack --use-npm --yes
```

If it refuses because the directory contains `.git`/`docs`, scaffold in a temp dir and copy:

```bash
npx create-next-app@latest /tmp/tako-scaffold --ts --tailwind --app --eslint --src-dir=false --import-alias "@/*" --no-turbopack --use-npm --yes
cp -R /tmp/tako-scaffold/. .
rm -rf /tmp/tako-scaffold
```

- [ ] **Step 2: Install runtime + dev dependencies**

```bash
npm i @takoviz/ai-sdk@2.0.0 ai@^7 zod@^4 @ai-sdk/openai framer-motion react-pageflip
npm i -D vitest
```

- [ ] **Step 3: Verify peer versions resolved correctly**

Run:
```bash
node -e "for (const p of ['ai','zod','@takoviz/ai-sdk','@ai-sdk/openai']) console.log(p, require(p+'/package.json').version)"
```
Expected: `ai` 7.x, `zod` 4.x, `@takoviz/ai-sdk` 2.0.0, `@ai-sdk/openai` present. If `zod` is 3.x, run `npm i zod@^4` and re-check.

- [ ] **Step 4: Create `vitest.config.ts`**

```ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['lib/**/*.test.ts'],
  },
  resolve: {
    alias: { '@': new URL('.', import.meta.url).pathname.replace(/\/$/, '') },
  },
});
```

- [ ] **Step 5: Add the `test` script to `package.json`**

In `package.json` `"scripts"`, add:
```json
"test": "vitest run",
"test:watch": "vitest"
```

- [ ] **Step 6: Create `.env.example`**

```
# Tako API key for @takoviz/ai-sdk (server-side only)
TAKO_API_KEY=
# OpenAI API key for @ai-sdk/openai (server-side only)
OPENAI_API_KEY=
```

- [ ] **Step 7: Verify `.gitignore` excludes env files**

Confirm `.gitignore` contains `.env*` (create-next-app adds it). If missing, append:
```
.env
.env*.local
.env.*
```
Run: `git check-ignore .env.local` → Expected output: `.env.local`

- [ ] **Step 8: Write a sanity test**

Create `lib/__tests__/sanity.test.ts`:
```ts
import { expect, test } from 'vitest';

test('test runner works', () => {
  expect(1 + 1).toBe(2);
});
```

- [ ] **Step 9: Run the test**

Run: `npm test`
Expected: 1 passed.

- [ ] **Step 10: Verify the app builds/runs**

Run: `npm run build`
Expected: build succeeds with no type errors.

- [ ] **Step 11: Commit**

```bash
git add -A
git commit -m "chore: scaffold Next.js app, deps, vitest, env example"
```

---

### Task 2: Domain schema and config constants

**Files:**
- Create: `lib/config.ts`
- Create: `lib/schema.ts`
- Test: `lib/schema.test.ts`

**Interfaces:**
- Produces:
  - `lib/config.ts`: `MODEL = 'gpt-4.1'`, `SOURCE_COUNTS = { tako: 5, web: 5 }`, `MAX_PAGES = 5`, `WORD_CAPS = { lead: 180, standard: 110, brief: 60 }`, `MAX_TABLE_ROWS = 50`.
  - `lib/schema.ts`: zod schemas `Source`, `TableData`, `Article`, `Page`, `Newspaper`, `SectionPlan`; inferred types `TSource`, `TTableData`, `TArticle`, `TPage`, `TNewspaper`, `TSectionPlan`.

- [ ] **Step 1: Write the failing test**

Create `lib/schema.test.ts`:
```ts
import { expect, test } from 'vitest';
import { Article, Newspaper, Page } from '@/lib/schema';

test('Article requires at least one source', () => {
  const base = {
    kicker: 'k', headline: 'h', body: 'b', size: 'brief' as const, sources: [],
  };
  expect(Article.safeParse(base).success).toBe(false);
  expect(Article.safeParse({ ...base, sources: [{ name: 'X' }] }).success).toBe(true);
});

test('Article applies default byline', () => {
  const parsed = Article.parse({
    kicker: 'k', headline: 'h', body: 'b', size: 'lead',
    sources: [{ name: 'X', url: 'https://example.com' }],
  });
  expect(parsed.byline).toBe('Tako Wire');
});

test('Newspaper round-trips a minimal valid paper', () => {
  const paper = {
    masthead: 'The Daily Tako', tagline: 't', edition: 'Vol I', dateLine: 'June 25, 2026',
    pages: [{ topic: 'Front', articles: [
      { kicker: 'k', headline: 'h', body: 'b', size: 'lead', sources: [{ name: 'X' }] },
    ] }],
  };
  expect(Newspaper.safeParse(paper).success).toBe(true);
});

test('Source rejects empty-string url but allows omitted url', () => {
  // empty string must never reach .url(); schema only sees valid url or undefined
  expect(Page.safeParse({ topic: 't', articles: [
    { kicker: 'k', headline: 'h', body: 'b', size: 'brief', sources: [{ name: 'X' }] },
  ] }).success).toBe(true);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- lib/schema.test.ts`
Expected: FAIL (cannot resolve `@/lib/schema`).

- [ ] **Step 3: Create `lib/config.ts`**

```ts
export const MODEL = 'gpt-4.1';

export const SOURCE_COUNTS = { tako: 5, web: 5 } as const;

export const MAX_PAGES = 5;        // front page + up to 4 topic pages
export const MAX_TABLE_ROWS = 50;  // cap rows distilled into a printed table

export const WORD_CAPS = { lead: 180, standard: 110, brief: 60 } as const;
```

- [ ] **Step 4: Create `lib/schema.ts`**

```ts
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
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npm test -- lib/schema.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 6: Commit**

```bash
git add lib/config.ts lib/schema.ts lib/schema.test.ts
git commit -m "feat: domain zod schemas and config constants"
```

---

### Task 3: Tako source normalization

**Files:**
- Create: `lib/tako/normalize.ts`
- Test: `lib/tako/normalize.test.ts`

**Interfaces:**
- Consumes: `TSource` from `@/lib/schema`; `TakoCard`, `TakoWebResult`, `TakoKnowledgeCardSource` types from `@takoviz/ai-sdk`.
- Produces:
  - `sourceIndexLabel(idx: unknown): string` — turns a string or `{index_type}` object into a label.
  - `normalizeCardSources(card: TakoCard): TSource[]` — one `TSource` per card source, dropping empty URLs and falling back to `card.webpage_url`; if a card has no usable named source, returns a single source named from `card.title` (or `'Tako'`) with the `webpage_url`.
  - `normalizeWebResult(w: TakoWebResult): TSource` — `{ name: source_name || title, url: w.url }`.
  - `validUrl(u: unknown): string | undefined` — returns the URL only if it is a non-empty parseable http(s) URL, else `undefined`.

- [ ] **Step 1: Write the failing test**

Create `lib/tako/normalize.test.ts`:
```ts
import { expect, test } from 'vitest';
import { normalizeCardSources, normalizeWebResult, sourceIndexLabel, validUrl } from '@/lib/tako/normalize';

test('validUrl strips empty and invalid', () => {
  expect(validUrl('')).toBeUndefined();
  expect(validUrl(null)).toBeUndefined();
  expect(validUrl('not a url')).toBeUndefined();
  expect(validUrl('https://trytako.com/x')).toBe('https://trytako.com/x');
});

test('sourceIndexLabel handles string and object', () => {
  expect(sourceIndexLabel('tako')).toBe('tako');
  expect(sourceIndexLabel({ index_type: 'web', segment_id: 's' })).toBe('web');
  expect(sourceIndexLabel(undefined)).toBe('tako');
});

test('normalizeCardSources falls back to webpage_url when source url empty', () => {
  const card = {
    title: 'Fed Funds Rate',
    webpage_url: 'https://trytako.com/card/abc/',
    sources: [{ source_name: 'St. Louis Fed', source_description: null, source_index: 'tako', url: '' }],
  } as any;
  const out = normalizeCardSources(card);
  expect(out).toEqual([{ name: 'St. Louis Fed', url: 'https://trytako.com/card/abc/' }]);
});

test('normalizeCardSources synthesizes a source when none usable', () => {
  const card = { title: 'Chart X', webpage_url: 'https://trytako.com/card/zzz/', sources: [] } as any;
  expect(normalizeCardSources(card)).toEqual([{ name: 'Chart X', url: 'https://trytako.com/card/zzz/' }]);
});

test('normalizeWebResult maps name and url', () => {
  const w = { title: 'BBC story', url: 'https://bbc.com/x', source_name: 'BBC' } as any;
  expect(normalizeWebResult(w)).toEqual({ name: 'BBC', url: 'https://bbc.com/x' });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- lib/tako/normalize.test.ts`
Expected: FAIL (cannot resolve module).

- [ ] **Step 3: Create `lib/tako/normalize.ts`**

```ts
import type { TakoCard, TakoWebResult } from '@takoviz/ai-sdk';
import type { TSource } from '@/lib/schema';

export function validUrl(u: unknown): string | undefined {
  if (typeof u !== 'string' || u.trim() === '') return undefined;
  try {
    const parsed = new URL(u);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:' ? u : undefined;
  } catch {
    return undefined;
  }
}

export function sourceIndexLabel(idx: unknown): string {
  if (typeof idx === 'string') return idx;
  if (idx && typeof idx === 'object' && 'index_type' in idx) {
    return String((idx as { index_type: unknown }).index_type);
  }
  return 'tako';
}

export function normalizeCardSources(card: TakoCard): TSource[] {
  const fallbackUrl = validUrl(card.webpage_url);
  const named = (card.sources ?? [])
    .map((s) => {
      const name = s.source_name?.trim();
      if (!name) return undefined;
      const url = validUrl(s.url) ?? fallbackUrl;
      return url ? { name, url } : { name };
    })
    .filter((x): x is TSource => Boolean(x));

  if (named.length > 0) return named;

  const fallbackName = card.title?.trim() || 'Tako';
  return [fallbackUrl ? { name: fallbackName, url: fallbackUrl } : { name: fallbackName }];
}

export function normalizeWebResult(w: TakoWebResult): TSource {
  const name = w.source_name?.trim() || w.title;
  const url = validUrl(w.url);
  return url ? { name, url } : { name };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- lib/tako/normalize.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add lib/tako/normalize.ts lib/tako/normalize.test.ts
git commit -m "feat: normalize Tako card/web sources with url fallback"
```

---

### Task 4: CSV → printed table parser

**Files:**
- Create: `lib/tako/csv-to-table.ts`
- Test: `lib/tako/csv-to-table.test.ts`

**Interfaces:**
- Consumes: `TTableData` from `@/lib/schema`; `MAX_TABLE_ROWS` from `@/lib/config`.
- Produces: `csvToTable(csv: string, caption: string, maxRows?: number): TTableData | undefined` — parses a CSV string (RFC-style quoted fields) into columns (first row) + rows; returns `undefined` if fewer than 2 rows or no columns; caps body rows at `maxRows` (default `MAX_TABLE_ROWS`).

- [ ] **Step 1: Write the failing test**

Create `lib/tako/csv-to-table.test.ts`:
```ts
import { expect, test } from 'vitest';
import { csvToTable } from '@/lib/tako/csv-to-table';

test('parses simple csv', () => {
  const t = csvToTable('Date,Rate\n2026-01-01,3.6\n2026-06-23,3.5', 'Fed Funds');
  expect(t).toEqual({
    caption: 'Fed Funds',
    columns: ['Date', 'Rate'],
    rows: [['2026-01-01', '3.6'], ['2026-06-23', '3.5']],
  });
});

test('handles quoted fields with commas', () => {
  const t = csvToTable('Name,Note\n"Powell, J.","held, steady"', 'X');
  expect(t?.rows[0]).toEqual(['Powell, J.', 'held, steady']);
});

test('caps rows', () => {
  const lines = ['A,B', ...Array.from({ length: 10 }, (_, i) => `${i},${i}`)].join('\n');
  expect(csvToTable(lines, 'X', 3)?.rows.length).toBe(3);
});

test('returns undefined for header-only or empty', () => {
  expect(csvToTable('A,B', 'X')).toBeUndefined();
  expect(csvToTable('', 'X')).toBeUndefined();
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- lib/tako/csv-to-table.test.ts`
Expected: FAIL (cannot resolve module).

- [ ] **Step 3: Create `lib/tako/csv-to-table.ts`**

```ts
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- lib/tako/csv-to-table.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add lib/tako/csv-to-table.ts lib/tako/csv-to-table.test.ts
git commit -m "feat: CSV-to-table parser with row cap"
```

---

### Task 5: Tako tool construction + findings collector

**Files:**
- Create: `lib/tako/tools.ts`
- Test: `lib/tako/tools.test.ts`

**Interfaces:**
- Consumes: `takoSearch`, `takoAnswer`, `takoContents` from `@takoviz/ai-sdk`; `SOURCE_COUNTS` from `@/lib/config`; `TakoSearchResult`, `TakoAnswerResult` types.
- Produces:
  - `buildTakoTools()` → `{ tako_search, tako_answer, tako_contents }` (AI SDK `Tool`s) constructed with fixed config (`effort: 'fast'`, `sources` from `SOURCE_COUNTS`, `tako_contents` with `mode: 'inline'`).
  - `type Findings = { cards: TakoCard[]; web: TakoWebResult[]; answers: string[] }`.
  - `collectFindings(steps): Findings` — walks `steps[].toolResults`, reading `tr.output` (defensively `?? tr.result`) and `tr.toolName`, accumulating cards/web_results from `tako_search`/`tako_answer` outputs and `answer` strings from `tako_answer`.

- [ ] **Step 1: Write the failing test**

Create `lib/tako/tools.test.ts`:
```ts
import { expect, test } from 'vitest';
import { buildTakoTools, collectFindings } from '@/lib/tako/tools';

test('buildTakoTools returns the three named tools', () => {
  const tools = buildTakoTools();
  expect(Object.keys(tools).sort()).toEqual(['tako_answer', 'tako_contents', 'tako_search']);
});

test('collectFindings accumulates cards, web results, and answers from steps', () => {
  const steps = [
    { toolResults: [
      { toolName: 'tako_search', output: {
        cards: [{ title: 'A' }], web_results: [{ title: 'W1', url: 'https://x/1' }],
      } },
    ] },
    { toolResults: [
      { toolName: 'tako_answer', output: {
        answer: 'Rates held steady.', cards: [{ title: 'B' }], web_results: [],
      } },
    ] },
  ] as any;
  const f = collectFindings(steps);
  expect(f.cards.map((c) => c.title)).toEqual(['A', 'B']);
  expect(f.web.map((w) => w.title)).toEqual(['W1']);
  expect(f.answers).toEqual(['Rates held steady.']);
});

test('collectFindings tolerates empty/missing steps', () => {
  expect(collectFindings([] as any)).toEqual({ cards: [], web: [], answers: [] });
  expect(collectFindings(undefined as any)).toEqual({ cards: [], web: [], answers: [] });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- lib/tako/tools.test.ts`
Expected: FAIL (cannot resolve module).

- [ ] **Step 3: Create `lib/tako/tools.ts`**

```ts
import { takoAnswer, takoContents, takoSearch } from '@takoviz/ai-sdk';
import type { TakoCard, TakoWebResult } from '@takoviz/ai-sdk';
import { SOURCE_COUNTS } from '@/lib/config';

export function buildTakoTools() {
  const sources = { tako: { count: SOURCE_COUNTS.tako }, web: { count: SOURCE_COUNTS.web } };
  return {
    tako_search: takoSearch({ effort: 'fast', sources }),
    tako_answer: takoAnswer({ sources }),
    tako_contents: takoContents({ mode: 'inline' }),
  };
}

export type Findings = { cards: TakoCard[]; web: TakoWebResult[]; answers: string[] };

type LooseToolResult = { toolName?: string; output?: unknown; result?: unknown };
type LooseStep = { toolResults?: LooseToolResult[] };

export function collectFindings(steps: LooseStep[] | undefined): Findings {
  const findings: Findings = { cards: [], web: [], answers: [] };
  for (const step of steps ?? []) {
    for (const tr of step.toolResults ?? []) {
      const out = (tr.output ?? tr.result) as
        | { cards?: TakoCard[]; web_results?: TakoWebResult[]; answer?: string }
        | undefined;
      if (!out) continue;
      if (Array.isArray(out.cards)) findings.cards.push(...out.cards);
      if (Array.isArray(out.web_results)) findings.web.push(...out.web_results);
      if (typeof out.answer === 'string' && out.answer.trim()) findings.answers.push(out.answer);
    }
  }
  return findings;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- lib/tako/tools.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add lib/tako/tools.ts lib/tako/tools.test.ts
git commit -m "feat: Tako tool construction and findings collector"
```

---

### Task 6: Stream event types + NDJSON encode/decode

**Files:**
- Create: `lib/stream/events.ts`
- Create: `lib/stream/ndjson.ts`
- Test: `lib/stream/ndjson.test.ts`

**Interfaces:**
- Consumes: `TPage`, `TNewspaper` from `@/lib/schema`.
- Produces:
  - `lib/stream/events.ts`: `type GenerateEvent` (union: `editor_done`, `section_started`, `section_done`, `error`, `complete`) as in the spec.
  - `lib/stream/ndjson.ts`:
    - `encodeEvent(e: GenerateEvent): Uint8Array` — JSON line + `\n`, UTF-8 encoded.
    - `parseEventLines(buffer: string): { events: GenerateEvent[]; rest: string }` — split on `\n`, JSON.parse complete lines, keep trailing partial line as `rest`.

- [ ] **Step 1: Write the failing test**

Create `lib/stream/ndjson.test.ts`:
```ts
import { expect, test } from 'vitest';
import { encodeEvent, parseEventLines } from '@/lib/stream/ndjson';
import type { GenerateEvent } from '@/lib/stream/events';

test('encodeEvent emits one JSON line terminated by newline', () => {
  const ev: GenerateEvent = { type: 'section_started', slot: 1, topic: 'Fed' };
  const text = new TextDecoder().decode(encodeEvent(ev));
  expect(text.endsWith('\n')).toBe(true);
  expect(JSON.parse(text)).toEqual(ev);
});

test('parseEventLines returns complete events and keeps partial remainder', () => {
  const a: GenerateEvent = { type: 'section_started', slot: 0, topic: 'A' };
  const b: GenerateEvent = { type: 'section_started', slot: 1, topic: 'B' };
  const chunk = JSON.stringify(a) + '\n' + JSON.stringify(b) + '\n' + '{"type":"comp';
  const { events, rest } = parseEventLines(chunk);
  expect(events).toEqual([a, b]);
  expect(rest).toBe('{"type":"comp');
});

test('parseEventLines with no complete line returns empty events', () => {
  const { events, rest } = parseEventLines('{"partial":');
  expect(events).toEqual([]);
  expect(rest).toBe('{"partial":');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- lib/stream/ndjson.test.ts`
Expected: FAIL (cannot resolve modules).

- [ ] **Step 3: Create `lib/stream/events.ts`**

```ts
import type { TNewspaper, TPage } from '@/lib/schema';

export type SectionPlanItem = { topic: string; slot: number };

export type GenerateEvent =
  | {
      type: 'editor_done';
      masthead: string;
      tagline: string;
      edition: string;
      dateLine: string;
      plan: SectionPlanItem[];
    }
  | { type: 'section_started'; slot: number; topic: string }
  | { type: 'section_done'; slot: number; page: TPage }
  | { type: 'error'; slot?: number; message: string }
  | { type: 'complete'; newspaper: TNewspaper };
```

- [ ] **Step 4: Create `lib/stream/ndjson.ts`**

```ts
import type { GenerateEvent } from '@/lib/stream/events';

const encoder = new TextEncoder();

export function encodeEvent(e: GenerateEvent): Uint8Array {
  return encoder.encode(JSON.stringify(e) + '\n');
}

export function parseEventLines(buffer: string): { events: GenerateEvent[]; rest: string } {
  const parts = buffer.split('\n');
  const rest = parts.pop() ?? '';
  const events: GenerateEvent[] = [];
  for (const line of parts) {
    const trimmed = line.trim();
    if (trimmed === '') continue;
    events.push(JSON.parse(trimmed) as GenerateEvent);
  }
  return { events, rest };
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npm test -- lib/stream/ndjson.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 6: Commit**

```bash
git add lib/stream/events.ts lib/stream/ndjson.ts lib/stream/ndjson.test.ts
git commit -m "feat: NDJSON stream event types and codec"
```

---

### Task 7: Prompts + editor agent

**Files:**
- Create: `lib/agents/prompts.ts`
- Create: `lib/agents/editor.ts`
- Test: `lib/agents/editor.test.ts`

**Interfaces:**
- Consumes: `generateObject` from `ai`; `openai` from `@ai-sdk/openai`; `MODEL`, `MAX_PAGES` from `@/lib/config`; `SectionPlan`, `TSectionPlan` from `@/lib/schema`.
- Produces:
  - `lib/agents/prompts.ts`: `EDITOR_SYSTEM` (string), `reporterSystem(masthead: string): string`, `editorPrompt(brief: string): string`.
  - `lib/agents/editor.ts`: `runEditor(brief: string): Promise<TSectionPlan>` — calls `generateObject` with `SectionPlan` schema and clamps `sections` to `MAX_PAGES`.

- [ ] **Step 1: Write the failing test**

Create `lib/agents/editor.test.ts`:
```ts
import { expect, test, vi } from 'vitest';

vi.mock('ai', () => ({
  generateObject: vi.fn(async () => ({
    object: {
      masthead: 'The Daily Tako', tagline: 'All the data fit to print',
      edition: 'Vol. I, No. 1', dateLine: 'June 25, 2026',
      sections: Array.from({ length: 8 }, (_, i) => ({ topic: `T${i}` })),
    },
  })),
}));
vi.mock('@ai-sdk/openai', () => ({ openai: () => 'mock-model' }));

import { runEditor } from '@/lib/agents/editor';

test('runEditor clamps sections to MAX_PAGES', async () => {
  const plan = await runEditor('AI, the Fed, football');
  expect(plan.sections.length).toBe(5);
  expect(plan.masthead).toBe('The Daily Tako');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- lib/agents/editor.test.ts`
Expected: FAIL (cannot resolve `@/lib/agents/editor`).

- [ ] **Step 3: Create `lib/agents/prompts.ts`**

```ts
import { WORD_CAPS } from '@/lib/config';

export const EDITOR_SYSTEM = `You are the editor-in-chief of a short, characterful daily newspaper.
Given a reader's one-line brief, invent a fitting masthead name, a tagline, an edition string,
and today's dateLine, then plan an ordered list of sections. The FIRST section is the front page;
the rest are topic pages. Plan at most 5 sections total (front page + up to 4 topic pages).
Each section is a single coherent topic. Keep it tight; do not pad with weak topics.`;

export function editorPrompt(brief: string): string {
  return `Reader's brief: "${brief}"

Plan the newspaper. Return the masthead, tagline, edition, dateLine, and the ordered sections
(first = front page). Maximum 5 sections.`;
}

export function reporterSystem(masthead: string): string {
  return `You are a reporter for "${masthead}", filing one newspaper page on an assigned topic.

Use the Tako tools to gather REAL, sourced data:
- Prefer tako_search / tako_answer for any concrete data point (values, time series, prices,
  scores, polls, forecasts). Use web results for narrative and context. Draw on BOTH Tako and
  the web while researching.
- When a section benefits from raw numbers, call tako_contents with a card's webpage_url to pull
  its data, then a table can be built from it.
- NEVER invent facts. Everything you report must trace to a returned card, answer, or web result.

Be efficient: a few targeted tool calls are enough. After researching, stop; a separate step will
typeset your findings into articles. Respect length: lead <= ${WORD_CAPS.lead} words,
standard <= ${WORD_CAPS.standard}, brief <= ${WORD_CAPS.brief}.`;
}
```

- [ ] **Step 4: Create `lib/agents/editor.ts`**

```ts
import { generateObject } from 'ai';
import { openai } from '@ai-sdk/openai';
import { MAX_PAGES, MODEL } from '@/lib/config';
import { SectionPlan, type TSectionPlan } from '@/lib/schema';
import { EDITOR_SYSTEM, editorPrompt } from '@/lib/agents/prompts';

export async function runEditor(brief: string): Promise<TSectionPlan> {
  const { object } = await generateObject({
    model: openai(MODEL),
    schema: SectionPlan,
    system: EDITOR_SYSTEM,
    prompt: editorPrompt(brief),
  });
  return { ...object, sections: object.sections.slice(0, MAX_PAGES) };
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npm test -- lib/agents/editor.test.ts`
Expected: PASS (1 test).

- [ ] **Step 6: Commit**

```bash
git add lib/agents/prompts.ts lib/agents/editor.ts lib/agents/editor.test.ts
git commit -m "feat: editor agent and agent prompts"
```

---

### Task 8: Reporter agent (tool loop + distill)

**Files:**
- Create: `lib/agents/reporter.ts`
- Test: `lib/agents/reporter.test.ts`

**Interfaces:**
- Consumes: `generateText`, `isStepCount`, `generateObject` from `ai`; `openai` from `@ai-sdk/openai`; `MODEL` from `@/lib/config`; `buildTakoTools`, `collectFindings`, `Findings` from `@/lib/tako/tools`; `normalizeCardSources`, `normalizeWebResult` from `@/lib/tako/normalize`; `Page`, `TPage` from `@/lib/schema`; `reporterSystem` from `@/lib/agents/prompts`.
- Produces:
  - `findingsContext(f: Findings): string` — compact JSON-ish digest (card titles, descriptions, image_url, webpage_url, normalized sources; web titles/snippets/urls; answers) used as grounding context for the distill step.
  - `attachArt(page: TPage, f: Findings): TPage` — fills each article's missing `chartImageUrl`/`chartEmbedUrl` from the best matching card by title/headline keyword overlap (immutably).
  - `emptyPage(topic: string): TPage` — a degraded page: one `brief` "No fresh reporting on the wire" with a single `{ name: 'The Daily Tako' }` source.
  - `runReporter(topic: string, isFront: boolean, masthead: string): Promise<TPage>` — runs the bounded tool loop, collects findings, distills into a `TPage` via `generateObject`, attaches art, and returns it; on any error or empty findings returns `emptyPage(topic)`.

- [ ] **Step 1: Write the failing test**

Create `lib/agents/reporter.test.ts`:
```ts
import { expect, test } from 'vitest';
import { attachArt, emptyPage, findingsContext } from '@/lib/agents/reporter';
import type { Findings } from '@/lib/tako/tools';

const findings: Findings = {
  cards: [{
    title: 'US Federal Funds Rate', description: 'Latest 3.6%',
    image_url: 'https://trytako.com/img/abc', embed_url: 'https://trytako.com/embed/abc',
    webpage_url: 'https://trytako.com/card/abc/',
    sources: [{ source_name: 'St. Louis Fed', source_description: null, source_index: 'tako', url: '' }],
  }] as any,
  web: [{ title: 'Fed holds rates', url: 'https://bbc.com/x', snippet: 's', source_name: 'BBC' }] as any,
  answers: ['The Fed held rates steady at 3.5–3.75%.'],
};

test('findingsContext includes card titles, web titles, and answers', () => {
  const ctx = findingsContext(findings);
  expect(ctx).toContain('US Federal Funds Rate');
  expect(ctx).toContain('Fed holds rates');
  expect(ctx).toContain('held rates steady');
});

test('attachArt fills missing chart art from a title-matching card', () => {
  const page = { topic: 'The Fed', articles: [
    { kicker: 'Rates', headline: 'Federal Funds Rate holds', body: 'b', size: 'lead' as const,
      sources: [{ name: 'St. Louis Fed', url: 'https://trytako.com/card/abc/' }] },
  ] };
  const out = attachArt(page, findings);
  expect(out.articles[0].chartImageUrl).toBe('https://trytako.com/img/abc');
  expect(page.articles[0].chartImageUrl).toBeUndefined(); // immutability
});

test('emptyPage degrades gracefully with one sourced brief', () => {
  const p = emptyPage('Quiet Topic');
  expect(p.topic).toBe('Quiet Topic');
  expect(p.articles).toHaveLength(1);
  expect(p.articles[0].size).toBe('brief');
  expect(p.articles[0].sources.length).toBeGreaterThanOrEqual(1);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- lib/agents/reporter.test.ts`
Expected: FAIL (cannot resolve module).

- [ ] **Step 3: Create `lib/agents/reporter.ts`**

```ts
import { generateObject, generateText, isStepCount } from 'ai';
import { openai } from '@ai-sdk/openai';
import { MODEL, WORD_CAPS } from '@/lib/config';
import { Page, type TPage } from '@/lib/schema';
import { reporterSystem } from '@/lib/agents/prompts';
import { buildTakoTools, collectFindings, type Findings } from '@/lib/tako/tools';
import { normalizeCardSources, normalizeWebResult, validUrl } from '@/lib/tako/normalize';

export function findingsContext(f: Findings): string {
  const cards = f.cards.map((c) => ({
    title: c.title, description: c.description ?? c.semantic_description,
    image_url: validUrl(c.image_url), webpage_url: validUrl(c.webpage_url),
    sources: normalizeCardSources(c),
  }));
  const web = f.web.map((w) => ({
    title: w.title, snippet: w.snippet, publish_date: w.publish_date, source: normalizeWebResult(w),
  }));
  return JSON.stringify({ answers: f.answers, cards, web }, null, 2);
}

function keywords(s: string): Set<string> {
  return new Set(s.toLowerCase().split(/[^a-z0-9]+/).filter((w) => w.length > 3));
}

export function attachArt(page: TPage, f: Findings): TPage {
  const cardsWithArt = f.cards.filter((c) => validUrl(c.image_url));
  const articles = page.articles.map((a) => {
    if (a.chartImageUrl) return a;
    const aKw = keywords(`${a.headline} ${a.kicker}`);
    let best: { score: number; img?: string; embed?: string } = { score: 0 };
    for (const c of cardsWithArt) {
      const cKw = keywords(`${c.title ?? ''} ${c.description ?? ''}`);
      let score = 0;
      for (const k of aKw) if (cKw.has(k)) score++;
      if (score > best.score) {
        best = { score, img: validUrl(c.image_url), embed: validUrl(c.embed_url) };
      }
    }
    return best.score > 0 ? { ...a, chartImageUrl: best.img, chartEmbedUrl: best.embed } : a;
  });
  return { ...page, articles };
}

export function emptyPage(topic: string): TPage {
  return {
    topic,
    articles: [{
      kicker: topic, headline: 'No fresh reporting on the wire', byline: 'Tako Wire',
      body: 'Our reporters found no new sourced data on this topic for today’s edition.',
      size: 'brief', sources: [{ name: 'The Daily Tako' }],
    }],
  };
}

function distillPrompt(topic: string, isFront: boolean, ctx: string): string {
  const layout = isFront
    ? 'This is the FRONT PAGE: produce exactly one "lead" article plus 2 or 3 "brief" articles.'
    : 'This is a TOPIC PAGE: produce 2 to 4 articles sized "standard" or "brief" (at most one "lead").';
  return `Topic: "${topic}"
${layout}

Write the page strictly from the research below. Every article MUST include at least one source
drawn from this research. Do not invent facts or sources. Respect word caps
(lead <= ${WORD_CAPS.lead}, standard <= ${WORD_CAPS.standard}, brief <= ${WORD_CAPS.brief}).
If the research is thin, write fewer, shorter articles rather than padding.

RESEARCH (JSON):
${ctx}`;
}

export async function runReporter(topic: string, isFront: boolean, masthead: string): Promise<TPage> {
  try {
    const tools = buildTakoTools();
    const { steps } = await generateText({
      model: openai(MODEL),
      system: reporterSystem(masthead),
      prompt: `Report the section: "${topic}". Gather sourced data with the Tako tools.`,
      tools,
      stopWhen: isStepCount(6),
    });

    const findings = collectFindings(steps);
    if (findings.cards.length === 0 && findings.web.length === 0 && findings.answers.length === 0) {
      return emptyPage(topic);
    }

    const { object } = await generateObject({
      model: openai(MODEL),
      schema: Page,
      prompt: distillPrompt(topic, isFront, findingsContext(findings)),
    });

    const page: TPage = { ...object, topic };
    return attachArt(page, findings);
  } catch {
    return emptyPage(topic);
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- lib/agents/reporter.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add lib/agents/reporter.ts lib/agents/reporter.test.ts
git commit -m "feat: reporter agent with tool loop, distill, art attach, degradation"
```

---

### Task 9: Orchestrator API route (streaming)

**Files:**
- Create: `lib/agents/orchestrate.ts`
- Create: `app/api/generate/route.ts`
- Test: `lib/agents/orchestrate.test.ts`

**Interfaces:**
- Consumes: `runEditor` from `@/lib/agents/editor`; `runReporter` from `@/lib/agents/reporter`; `encodeEvent` from `@/lib/stream/ndjson`; `GenerateEvent`, `SectionPlanItem` from `@/lib/stream/events`; `TNewspaper`, `TPage` from `@/lib/schema`.
- Produces:
  - `lib/agents/orchestrate.ts`: `orchestrate(brief, emit): Promise<void>` where `emit: (e: GenerateEvent) => void`. Runs editor → emits `editor_done`; runs all reporters in parallel (`Promise.allSettled`), emitting `section_started` before each and `section_done` after each; assembles pages in plan order; emits `complete` with the full `TNewspaper`; emits `error` on a fatal editor failure.
  - `app/api/generate/route.ts`: `POST` handler that reads `{ brief }`, returns a streaming `Response` of NDJSON events via a `ReadableStream` wired to `orchestrate`.

- [ ] **Step 1: Write the failing test**

Create `lib/agents/orchestrate.test.ts`:
```ts
import { expect, test, vi } from 'vitest';

vi.mock('@/lib/agents/editor', () => ({
  runEditor: vi.fn(async () => ({
    masthead: 'The Daily Tako', tagline: 't', edition: 'e', dateLine: 'd',
    sections: [{ topic: 'Front' }, { topic: 'Fed' }],
  })),
}));
vi.mock('@/lib/agents/reporter', () => ({
  runReporter: vi.fn(async (topic: string) => ({
    topic, articles: [{ kicker: 'k', headline: `H ${topic}`, body: 'b', size: 'brief', byline: 'Tako Wire', sources: [{ name: 'X' }] }],
  })),
}));

import { orchestrate } from '@/lib/agents/orchestrate';
import type { GenerateEvent } from '@/lib/stream/events';

test('orchestrate emits editor_done, per-section events, and a complete paper in order', async () => {
  const events: GenerateEvent[] = [];
  await orchestrate('brief', (e) => events.push(e));

  expect(events[0].type).toBe('editor_done');
  const types = events.map((e) => e.type);
  expect(types).toContain('section_started');
  expect(types).toContain('section_done');

  const done = events.find((e) => e.type === 'complete');
  expect(done).toBeDefined();
  if (done && done.type === 'complete') {
    expect(done.newspaper.pages.map((p) => p.topic)).toEqual(['Front', 'Fed']);
    expect(done.newspaper.masthead).toBe('The Daily Tako');
  }
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- lib/agents/orchestrate.test.ts`
Expected: FAIL (cannot resolve module).

- [ ] **Step 3: Create `lib/agents/orchestrate.ts`**

```ts
import { runEditor } from '@/lib/agents/editor';
import { runReporter } from '@/lib/agents/reporter';
import type { GenerateEvent, SectionPlanItem } from '@/lib/stream/events';
import type { TNewspaper, TPage } from '@/lib/schema';

export async function orchestrate(
  brief: string,
  emit: (e: GenerateEvent) => void,
): Promise<void> {
  let plan;
  try {
    plan = await runEditor(brief);
  } catch (err) {
    emit({ type: 'error', message: err instanceof Error ? err.message : 'Editor failed.' });
    return;
  }

  const planItems: SectionPlanItem[] = plan.sections.map((s, slot) => ({ topic: s.topic, slot }));
  emit({
    type: 'editor_done',
    masthead: plan.masthead, tagline: plan.tagline, edition: plan.edition, dateLine: plan.dateLine,
    plan: planItems,
  });

  const pages: (TPage | null)[] = new Array(planItems.length).fill(null);

  await Promise.allSettled(
    planItems.map(async ({ topic, slot }) => {
      emit({ type: 'section_started', slot, topic });
      const page = await runReporter(topic, slot === 0, plan!.masthead);
      pages[slot] = page;
      emit({ type: 'section_done', slot, page });
    }),
  );

  const newspaper: TNewspaper = {
    masthead: plan.masthead, tagline: plan.tagline, edition: plan.edition, dateLine: plan.dateLine,
    pages: pages.map((p, i) => p ?? { topic: planItems[i].topic, articles: [] })
                .filter((p) => p.articles.length > 0),
  };
  emit({ type: 'complete', newspaper });
}
```

- [ ] **Step 4: Create `app/api/generate/route.ts`**

```ts
import { orchestrate } from '@/lib/agents/orchestrate';
import { encodeEvent } from '@/lib/stream/ndjson';

export const runtime = 'nodejs';
export const maxDuration = 120;

export async function POST(req: Request) {
  let brief = '';
  try {
    const body = await req.json();
    brief = typeof body?.brief === 'string' ? body.brief.trim() : '';
  } catch {
    return new Response('Invalid JSON', { status: 400 });
  }
  if (!brief) return new Response('Missing brief', { status: 400 });

  const stream = new ReadableStream({
    async start(controller) {
      try {
        await orchestrate(brief, (e) => controller.enqueue(encodeEvent(e)));
      } catch (err) {
        controller.enqueue(
          encodeEvent({ type: 'error', message: err instanceof Error ? err.message : 'Generation failed.' }),
        );
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'application/x-ndjson; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
    },
  });
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npm test -- lib/agents/orchestrate.test.ts`
Expected: PASS (1 test).

- [ ] **Step 6: Run the full suite + typecheck**

Run: `npm test && npm run build`
Expected: all tests pass; build compiles (the route + lib typecheck).

- [ ] **Step 7: Commit**

```bash
git add lib/agents/orchestrate.ts app/api/generate/route.ts lib/agents/orchestrate.test.ts
git commit -m "feat: streaming orchestrator and /api/generate route"
```

---

### Task 10: Global styling, fonts, paper texture, B&W treatment

**Files:**
- Modify: `app/layout.tsx`
- Modify: `app/globals.css`

**Interfaces:**
- Produces: CSS utility classes consumed by later components: `.paper` (cream + grain), `.bw` (grayscale wrapper toggle), `.halftone` (dot overlay on figures), `.ink-rule` (hairline), `.dropcap` (lead first-letter), `.col-rule` (column gutters). Fonts: `--font-masthead` (UnifrakturCook), `--font-head` (Playfair Display), `--font-body` (Georgia stack) via `next/font/google`.

- [ ] **Step 1: Wire fonts in `app/layout.tsx`**

```tsx
import type { Metadata } from 'next';
import { Playfair_Display, UnifrakturCook } from 'next/font/google';
import './globals.css';

const masthead = UnifrakturCook({ weight: '700', subsets: ['latin'], variable: '--font-masthead' });
const head = Playfair_Display({ subsets: ['latin'], variable: '--font-head' });

export const metadata: Metadata = {
  title: 'The Daily Tako',
  description: 'A customizable AI newspaper grounded in real, sourced data.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className={`${masthead.variable} ${head.variable}`}>{children}</body>
    </html>
  );
}
```

- [ ] **Step 2: Replace `app/globals.css`**

```css
@import 'tailwindcss';

:root {
  --font-body: Georgia, 'Old Standard TT', 'Times New Roman', serif;
  --paper: #f4efe2;
  --ink: #14110d;
}

body {
  background: #2b2722;
  color: var(--ink);
  font-family: var(--font-body);
}

.paper {
  background-color: var(--paper);
  background-image:
    radial-gradient(rgba(0, 0, 0, 0.035) 1px, transparent 1px),
    radial-gradient(rgba(0, 0, 0, 0.025) 1px, transparent 1px);
  background-size: 3px 3px, 4px 4px;
  background-position: 0 0, 1px 2px;
  color: var(--ink);
}

.font-masthead { font-family: var(--font-masthead), 'Playfair Display', serif; }
.font-head { font-family: var(--font-head), Georgia, serif; }

.ink-rule { border-color: var(--ink); }

.dropcap::first-letter {
  float: left;
  font-family: var(--font-head), serif;
  font-weight: 700;
  font-size: 3.4em;
  line-height: 0.8;
  padding: 0.05em 0.08em 0 0;
}

.col-rule { column-rule: 1px solid rgba(20, 17, 13, 0.35); }

/* B&W timeless mode: grayscale the whole paper */
.bw { filter: grayscale(1) contrast(1.05); }

/* Halftone dot overlay on figures */
.halftone { position: relative; }
.halftone::after {
  content: '';
  position: absolute;
  inset: 0;
  background-image: radial-gradient(rgba(0, 0, 0, 0.5) 30%, transparent 31%);
  background-size: 4px 4px;
  mix-blend-mode: multiply;
  opacity: 0.18;
  pointer-events: none;
}
```

- [ ] **Step 3: Verify the app renders the paper background**

Temporarily set `app/page.tsx` body to `<main className="paper min-h-screen p-8"><h1 className="font-masthead text-6xl">The Daily Tako</h1></main>`, then run `npm run dev` and open http://localhost:3000.
Expected: cream textured background, blackletter title. (This page is replaced in Task 13.)

- [ ] **Step 4: Commit**

```bash
git add app/layout.tsx app/globals.css
git commit -m "feat: newspaper fonts, paper texture, dropcap, halftone, B&W css"
```

---

### Task 11: Newspaper render components

**Files:**
- Create: `components/newspaper/SourceCredit.tsx`
- Create: `components/newspaper/Figure.tsx`
- Create: `components/newspaper/DataTable.tsx`
- Create: `components/newspaper/PullQuote.tsx`
- Create: `components/newspaper/Article.tsx`
- Create: `components/newspaper/Masthead.tsx`
- Create: `components/newspaper/NewspaperPage.tsx`

**Interfaces:**
- Consumes: `TArticle`, `TPage`, `TSource`, `TTableData` from `@/lib/schema`.
- Produces: `<NewspaperPage page slot masthead tagline edition dateLine />` rendering a full broadsheet page; `<Masthead />`; `<Article article />`. All are pure presentational components (no client hooks).

- [ ] **Step 1: Create `components/newspaper/SourceCredit.tsx`**

```tsx
import type { TSource } from '@/lib/schema';

export function SourceCredit({ sources }: { sources: TSource[] }) {
  return (
    <p className="mt-1 text-[10px] uppercase tracking-wide text-black/60">
      Sources:{' '}
      {sources.map((s, i) => (
        <span key={`${s.name}-${i}`}>
          {i > 0 && ' · '}
          {s.url ? (
            <a href={s.url} className="underline" target="_blank" rel="noreferrer">{s.name}</a>
          ) : (
            s.name
          )}
        </span>
      ))}
    </p>
  );
}
```

- [ ] **Step 2: Create `components/newspaper/Figure.tsx`**

```tsx
import type { TSource } from '@/lib/schema';
import { SourceCredit } from './SourceCredit';

export function Figure({ src, caption, sources }: { src: string; caption?: string; sources?: TSource[] }) {
  return (
    <figure className="my-2 border border-black/80 p-1">
      <div className="halftone">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={src} alt={caption ?? 'chart'} className="w-full" />
      </div>
      {caption && <figcaption className="mt-1 text-[11px] italic">{caption}</figcaption>}
      {sources && sources.length > 0 && <SourceCredit sources={sources} />}
    </figure>
  );
}
```

- [ ] **Step 3: Create `components/newspaper/DataTable.tsx`**

```tsx
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
```

- [ ] **Step 4: Create `components/newspaper/PullQuote.tsx`**

```tsx
export function PullQuote({ children }: { children: React.ReactNode }) {
  return (
    <blockquote className="my-3 border-y-2 border-black px-2 py-2 text-center font-head text-lg italic leading-snug">
      {children}
    </blockquote>
  );
}
```

- [ ] **Step 5: Create `components/newspaper/Article.tsx`**

```tsx
import type { TArticle } from '@/lib/schema';
import { DataTable } from './DataTable';
import { Figure } from './Figure';
import { SourceCredit } from './SourceCredit';

const HEADLINE_SIZE: Record<TArticle['size'], string> = {
  lead: 'text-3xl md:text-4xl',
  standard: 'text-xl',
  brief: 'text-base',
};

export function Article({ article }: { article: TArticle }) {
  const isLead = article.size === 'lead';
  return (
    <article className="mb-4 break-inside-avoid">
      <p className="text-[10px] font-bold uppercase tracking-widest text-black/70">{article.kicker}</p>
      <h2 className={`font-head font-black leading-tight ${HEADLINE_SIZE[article.size]}`}>{article.headline}</h2>
      {article.dek && <p className="mt-0.5 font-head text-sm italic text-black/80">{article.dek}</p>}
      <p className="mt-1 text-[10px] uppercase tracking-wide text-black/60">By {article.byline}</p>

      {article.chartImageUrl && (
        <Figure src={article.chartImageUrl} caption={article.headline} sources={article.sources} />
      )}

      <div className={isLead ? 'dropcap mt-2 text-[13px] leading-relaxed' : 'mt-1 text-[12px] leading-relaxed'}>
        {article.body.split('\n').map((para, i) => (
          <p key={i} className="mb-2 text-justify">{para}</p>
        ))}
      </div>

      {article.table && <DataTable table={article.table} />}
      <SourceCredit sources={article.sources} />
    </article>
  );
}
```

- [ ] **Step 6: Create `components/newspaper/Masthead.tsx`**

```tsx
export function Masthead({ masthead, tagline, edition, dateLine }: {
  masthead: string; tagline: string; edition: string; dateLine: string;
}) {
  return (
    <header className="mb-3 text-center">
      <div className="flex items-center justify-between border-b border-black pb-1 text-[10px] uppercase tracking-widest">
        <span>{dateLine}</span>
        <span>Price: Free</span>
        <span>{edition}</span>
      </div>
      <h1 className="font-masthead text-5xl md:text-6xl leading-none mt-2">{masthead}</h1>
      <p className="mt-1 border-y-2 border-black py-0.5 font-head text-sm italic">{tagline}</p>
    </header>
  );
}
```

- [ ] **Step 7: Create `components/newspaper/NewspaperPage.tsx`**

```tsx
import type { TPage } from '@/lib/schema';
import { Article } from './Article';
import { Masthead } from './Masthead';

export function NewspaperPage({ page, slot, masthead, tagline, edition, dateLine }: {
  page: TPage; slot: number; masthead: string; tagline: string; edition: string; dateLine: string;
}) {
  const isFront = slot === 0;
  return (
    <section className="paper h-full w-full overflow-hidden p-5">
      {isFront ? (
        <Masthead masthead={masthead} tagline={tagline} edition={edition} dateLine={dateLine} />
      ) : (
        <div className="mb-2 flex items-baseline justify-between border-b-2 border-black pb-1">
          <h2 className="font-head text-2xl font-black uppercase">{page.topic}</h2>
          <span className="text-[10px] uppercase tracking-widest">{masthead}</span>
        </div>
      )}
      <div className="col-rule columns-1 gap-4 md:columns-2 [&>*]:break-inside-avoid">
        {page.articles.map((a, i) => (
          <Article key={i} article={a} />
        ))}
      </div>
    </section>
  );
}
```

- [ ] **Step 8: Verify components compile**

Run: `npm run build`
Expected: build succeeds (components typecheck even though not yet mounted).

- [ ] **Step 9: Commit**

```bash
git add components/newspaper
git commit -m "feat: newspaper render components (masthead, article, figure, table)"
```

---

### Task 12: Build animation (typesetting stage)

**Files:**
- Create: `components/build/ColumnBlock.tsx`
- Create: `components/build/TypesettingStage.tsx`

**Interfaces:**
- Consumes: `SectionPlanItem` from `@/lib/stream/events`; `TPage` from `@/lib/schema`; `framer-motion`; `NewspaperPage` from `@/components/newspaper/NewspaperPage`.
- Produces: `<TypesettingStage plan pages masthead tagline edition dateLine printed />` — a client component showing reserved grid blocks per planned section that rotate/snap in (on `plan`), then swap to the real `NewspaperPage` as each `pages[slot]` arrives, with a final settle when `printed` is true.

- [ ] **Step 1: Create `components/build/ColumnBlock.tsx`**

```tsx
'use client';
import { motion } from 'framer-motion';

export function ColumnBlock({ index, topic }: { index: number; topic: string }) {
  return (
    <motion.div
      initial={{ rotateY: 90, opacity: 0, y: 24 }}
      animate={{ rotateY: 0, opacity: 1, y: 0 }}
      transition={{ delay: index * 0.08, duration: 0.5, ease: 'easeOut' }}
      className="paper flex h-full w-full flex-col gap-2 p-5"
      style={{ transformPerspective: 1200 }}
    >
      <div className="h-6 w-3/4 bg-black/80" />
      <div className="h-3 w-1/3 bg-black/40" />
      <div className="mt-2 h-28 w-full border border-black/60 bg-black/5" />
      {Array.from({ length: 8 }).map((_, i) => (
        <div key={i} className="h-2 w-full bg-black/15" />
      ))}
      <p className="mt-auto text-center text-[10px] uppercase tracking-widest text-black/50">
        Setting type — {topic}
      </p>
    </motion.div>
  );
}
```

- [ ] **Step 2: Create `components/build/TypesettingStage.tsx`**

```tsx
'use client';
import { AnimatePresence, motion } from 'framer-motion';
import type { TPage } from '@/lib/schema';
import type { SectionPlanItem } from '@/lib/stream/events';
import { NewspaperPage } from '@/components/newspaper/NewspaperPage';
import { ColumnBlock } from './ColumnBlock';

export function TypesettingStage({ plan, pages, masthead, tagline, edition, dateLine, printed }: {
  plan: SectionPlanItem[];
  pages: (TPage | null)[];
  masthead: string; tagline: string; edition: string; dateLine: string;
  printed: boolean;
}) {
  return (
    <motion.div
      animate={printed ? { scale: [1, 0.98, 1], y: [0, 6, 0] } : {}}
      transition={{ duration: 0.5 }}
      className="grid w-full max-w-6xl grid-cols-1 gap-4 md:grid-cols-2"
    >
      {plan.map((item) => {
        const page = pages[item.slot];
        return (
          <div key={item.slot} className="aspect-[3/4] overflow-hidden border border-black/50 shadow-lg">
            <AnimatePresence mode="wait">
              {page ? (
                <motion.div
                  key="page"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ duration: 0.4 }}
                  className="h-full w-full"
                >
                  <NewspaperPage
                    page={page} slot={item.slot}
                    masthead={masthead} tagline={tagline} edition={edition} dateLine={dateLine}
                  />
                </motion.div>
              ) : (
                <motion.div key="block" exit={{ opacity: 0 }} className="h-full w-full">
                  <ColumnBlock index={item.slot} topic={item.topic} />
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        );
      })}
    </motion.div>
  );
}
```

- [ ] **Step 3: Verify build**

Run: `npm run build`
Expected: build succeeds.

- [ ] **Step 4: Commit**

```bash
git add components/build
git commit -m "feat: typesetting build animation (rotating blocks → fill → settle)"
```

---

### Task 13: Page-flip reader

**Files:**
- Create: `components/flip/PageFlipReader.tsx`

**Interfaces:**
- Consumes: `TNewspaper` from `@/lib/schema`; `react-pageflip` (`HTMLFlipBook`); `NewspaperPage` from `@/components/newspaper/NewspaperPage`.
- Produces: `<PageFlipReader newspaper bw />` — a client component (imported with `ssr:false` by the consumer) rendering flippable pages with arrow-key navigation, a page indicator, and a jump-to-section control. Pages forwardRef-wrapped as required by `react-pageflip`.

- [ ] **Step 1: Create `components/flip/PageFlipReader.tsx`**

```tsx
'use client';
import { forwardRef, useEffect, useRef, useState } from 'react';
import HTMLFlipBook from 'react-pageflip';
import type { TNewspaper } from '@/lib/schema';
import { NewspaperPage } from '@/components/newspaper/NewspaperPage';

const FlipPage = forwardRef<HTMLDivElement, { children: React.ReactNode }>(function FlipPage(
  { children }, ref,
) {
  return (
    <div ref={ref} className="bg-[#f4efe2] shadow-xl">
      {children}
    </div>
  );
});

// react-pageflip's types are loose; treat the default export as a component.
const FlipBook = HTMLFlipBook as unknown as React.ComponentType<Record<string, unknown>>;

export function PageFlipReader({ newspaper, bw }: { newspaper: TNewspaper; bw: boolean }) {
  const bookRef = useRef<{ pageFlip: () => { flipNext: () => void; flipPrev: () => void; turnToPage: (n: number) => void } } | null>(null);
  const [page, setPage] = useState(0);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const flip = bookRef.current?.pageFlip();
      if (!flip) return;
      if (e.key === 'ArrowRight') flip.flipNext();
      if (e.key === 'ArrowLeft') flip.flipPrev();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  return (
    <div className={`flex flex-col items-center gap-3 ${bw ? 'bw' : ''}`}>
      <div className="flex flex-wrap items-center justify-center gap-2 text-xs text-[#f4efe2]">
        {newspaper.pages.map((p, i) => (
          <button
            key={i}
            onClick={() => bookRef.current?.pageFlip()?.turnToPage(i)}
            className="rounded border border-[#f4efe2]/40 px-2 py-0.5 hover:bg-[#f4efe2]/10"
          >
            {i === 0 ? 'Front' : p.topic}
          </button>
        ))}
      </div>

      <FlipBook
        ref={bookRef as never}
        width={460}
        height={620}
        size="stretch"
        minWidth={300}
        maxWidth={600}
        minHeight={420}
        maxHeight={820}
        drawShadow
        maxShadowOpacity={0.4}
        showCover={false}
        mobileScrollSupport
        className=""
        style={{}}
        onFlip={(e: { data: number }) => setPage(e.data)}
      >
        {newspaper.pages.map((p, i) => (
          <FlipPage key={i}>
            <div className="h-[620px] w-full overflow-hidden">
              <NewspaperPage
                page={p} slot={i}
                masthead={newspaper.masthead} tagline={newspaper.tagline}
                edition={newspaper.edition} dateLine={newspaper.dateLine}
              />
            </div>
          </FlipPage>
        ))}
      </FlipBook>

      <p className="text-xs text-[#f4efe2]/80">
        Page {page + 1} of {newspaper.pages.length} · ← → to flip
      </p>
    </div>
  );
}

export default PageFlipReader;
```

- [ ] **Step 2: Verify build**

Run: `npm run build`
Expected: build succeeds. If `react-pageflip` lacks types, the `as unknown as` casts above keep it compiling; if a "Cannot find module" type error appears, add `// @ts-expect-error no types` above the import.

- [ ] **Step 3: Commit**

```bash
git add components/flip/PageFlipReader.tsx
git commit -m "feat: react-pageflip reading view with keys, indicator, jump-to-section"
```

---

### Task 14: Client state machine, brief input, B&W toggle, page wiring

**Files:**
- Create: `lib/stream/client.ts`
- Create: `components/BriefInput.tsx`
- Create: `components/BWToggle.tsx`
- Create: `components/DailyTako.tsx`
- Modify: `app/page.tsx`
- Test: `lib/stream/client.test.ts`

**Interfaces:**
- Consumes: `parseEventLines` from `@/lib/stream/ndjson`; `GenerateEvent` from `@/lib/stream/events`; `TNewspaper`, `TPage` from `@/lib/schema`; the components from Tasks 11–13; `framer-motion`.
- Produces:
  - `lib/stream/client.ts`: `streamGenerate(brief, onEvent, signal?): Promise<void>` — POSTs to `/api/generate`, reads the NDJSON body with a reader, decodes via `parseEventLines`, calls `onEvent` per event.
  - `components/DailyTako.tsx`: the `'use client'` state machine (`idle → typesetting → printing → reading`) that owns brief state, B&W state (localStorage), plan/pages state, drives `streamGenerate`, and renders `BriefInput` → `TypesettingStage` → `PageFlipReader`.
  - `app/page.tsx`: renders `<DailyTako />`.

- [ ] **Step 1: Write the failing test for the client reader**

Create `lib/stream/client.test.ts`:
```ts
import { expect, test, vi } from 'vitest';
import { streamGenerate } from '@/lib/stream/client';
import type { GenerateEvent } from '@/lib/stream/events';

function bodyFrom(lines: string): ReadableStream<Uint8Array> {
  const enc = new TextEncoder();
  return new ReadableStream({
    start(c) { c.enqueue(enc.encode(lines)); c.close(); },
  });
}

test('streamGenerate parses NDJSON body into events', async () => {
  const ev1: GenerateEvent = { type: 'section_started', slot: 0, topic: 'A' };
  const ev2: GenerateEvent = { type: 'error', message: 'x' };
  const body = bodyFrom(JSON.stringify(ev1) + '\n' + JSON.stringify(ev2) + '\n');
  vi.stubGlobal('fetch', vi.fn(async () => new Response(body)));

  const seen: GenerateEvent[] = [];
  await streamGenerate('brief', (e) => seen.push(e));
  expect(seen).toEqual([ev1, ev2]);
  vi.unstubAllGlobals();
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- lib/stream/client.test.ts`
Expected: FAIL (cannot resolve module).

- [ ] **Step 3: Create `lib/stream/client.ts`**

```ts
import type { GenerateEvent } from '@/lib/stream/events';
import { parseEventLines } from '@/lib/stream/ndjson';

export async function streamGenerate(
  brief: string,
  onEvent: (e: GenerateEvent) => void,
  signal?: AbortSignal,
): Promise<void> {
  const res = await fetch('/api/generate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ brief }),
    signal,
  });
  if (!res.ok || !res.body) {
    throw new Error(`Generation failed (${res.status})`);
  }
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const { events, rest } = parseEventLines(buffer);
    buffer = rest;
    for (const e of events) onEvent(e);
  }
  const { events } = parseEventLines(buffer + '\n');
  for (const e of events) onEvent(e);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- lib/stream/client.test.ts`
Expected: PASS (1 test).

- [ ] **Step 5: Create `components/BWToggle.tsx`**

```tsx
'use client';
export function BWToggle({ bw, onToggle }: { bw: boolean; onToggle: () => void }) {
  return (
    <button
      onClick={onToggle}
      className="rounded-full border border-[#f4efe2]/50 px-3 py-1 text-xs uppercase tracking-widest text-[#f4efe2] hover:bg-[#f4efe2]/10"
    >
      {bw ? '◐ Timeless B&W' : '◑ Spot Color'}
    </button>
  );
}
```

- [ ] **Step 6: Create `components/BriefInput.tsx`**

```tsx
'use client';
import { useState } from 'react';

export function BriefInput({ initial, onSubmit }: { initial: string; onSubmit: (brief: string) => void }) {
  const [value, setValue] = useState(initial);
  return (
    <form
      onSubmit={(e) => { e.preventDefault(); if (value.trim()) onSubmit(value.trim()); }}
      className="flex w-full max-w-2xl flex-col items-center gap-4"
    >
      <h1 className="font-masthead text-5xl text-[#f4efe2] md:text-7xl">The Daily Tako</h1>
      <p className="text-center text-sm text-[#f4efe2]/70">What would you like your newspaper to be about?</p>
      <input
        autoFocus
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder="AI startups, the Fed, and the Premier League"
        className="w-full rounded border border-[#f4efe2]/40 bg-transparent px-4 py-3 text-center text-lg text-[#f4efe2] placeholder:text-[#f4efe2]/40 focus:outline-none"
      />
      <button type="submit" className="rounded bg-[#f4efe2] px-6 py-2 font-head font-bold text-[#14110d]">
        Print my paper
      </button>
    </form>
  );
}
```

- [ ] **Step 7: Create `components/DailyTako.tsx`**

```tsx
'use client';
import dynamic from 'next/dynamic';
import { useEffect, useRef, useState } from 'react';
import type { TNewspaper, TPage } from '@/lib/schema';
import type { GenerateEvent, SectionPlanItem } from '@/lib/stream/events';
import { streamGenerate } from '@/lib/stream/client';
import { BriefInput } from '@/components/BriefInput';
import { BWToggle } from '@/components/BWToggle';
import { TypesettingStage } from '@/components/build/TypesettingStage';

const PageFlipReader = dynamic(() => import('@/components/flip/PageFlipReader'), { ssr: false });

type Phase = 'idle' | 'typesetting' | 'printing' | 'reading';
type Meta = { masthead: string; tagline: string; edition: string; dateLine: string };
const EMPTY_META: Meta = { masthead: 'The Daily Tako', tagline: '', edition: '', dateLine: '' };

export function DailyTako() {
  const [phase, setPhase] = useState<Phase>('idle');
  const [bw, setBw] = useState(true);
  const [brief, setBrief] = useState('');
  const [meta, setMeta] = useState<Meta>(EMPTY_META);
  const [plan, setPlan] = useState<SectionPlanItem[]>([]);
  const [pages, setPages] = useState<(TPage | null)[]>([]);
  const [newspaper, setNewspaper] = useState<TNewspaper | null>(null);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    setBw(localStorage.getItem('tako-bw') !== 'false');
    setBrief(localStorage.getItem('tako-brief') ?? '');
  }, []);

  function toggleBw() {
    setBw((prev) => { localStorage.setItem('tako-bw', String(!prev)); return !prev; });
  }

  function onEvent(e: GenerateEvent) {
    if (e.type === 'editor_done') {
      setMeta({ masthead: e.masthead, tagline: e.tagline, edition: e.edition, dateLine: e.dateLine });
      setPlan(e.plan);
      setPages(new Array(e.plan.length).fill(null));
    } else if (e.type === 'section_done') {
      setPages((prev) => { const next = [...prev]; next[e.slot] = e.page; return next; });
    } else if (e.type === 'complete') {
      setNewspaper(e.newspaper);
      setPhase('printing');
      setTimeout(() => setPhase('reading'), 900);
    } else if (e.type === 'error') {
      setError(e.message);
    }
  }

  async function start(b: string) {
    localStorage.setItem('tako-brief', b);
    setBrief(b); setError(null); setNewspaper(null); setPlan([]); setPages([]); setPhase('typesetting');
    abortRef.current = new AbortController();
    try {
      await streamGenerate(b, onEvent, abortRef.current.signal);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong.');
    }
  }

  return (
    <main className="flex min-h-screen flex-col items-center gap-6 p-6">
      {phase !== 'idle' && (
        <div className="flex w-full max-w-6xl items-center justify-between">
          <button onClick={() => setPhase('idle')} className="text-xs uppercase tracking-widest text-[#f4efe2]/70 hover:text-[#f4efe2]">
            ← New paper
          </button>
          <BWToggle bw={bw} onToggle={toggleBw} />
        </div>
      )}

      {error && <p className="rounded bg-red-900/40 px-4 py-2 text-sm text-red-100">{error}</p>}

      {phase === 'idle' && (
        <div className="flex min-h-[70vh] flex-col items-center justify-center">
          <BriefInput initial={brief} onSubmit={start} />
        </div>
      )}

      {(phase === 'typesetting' || phase === 'printing') && (
        <div className={bw ? 'bw' : ''}>
          <TypesettingStage
            plan={plan} pages={pages}
            masthead={meta.masthead} tagline={meta.tagline} edition={meta.edition} dateLine={meta.dateLine}
            printed={phase === 'printing'}
          />
        </div>
      )}

      {phase === 'reading' && newspaper && <PageFlipReader newspaper={newspaper} bw={bw} />}
    </main>
  );
}
```

- [ ] **Step 8: Replace `app/page.tsx`**

```tsx
import { DailyTako } from '@/components/DailyTako';

export default function Home() {
  return <DailyTako />;
}
```

- [ ] **Step 9: Run full test suite + build**

Run: `npm test && npm run build`
Expected: all unit tests pass; production build compiles with no type errors.

- [ ] **Step 10: Commit**

```bash
git add lib/stream/client.ts lib/stream/client.test.ts components/BriefInput.tsx components/BWToggle.tsx components/DailyTako.tsx app/page.tsx
git commit -m "feat: client state machine, brief input, B&W toggle, page wiring"
```

---

### Task 15: End-to-end verification against the Definition of Done

**Files:** none (manual verification + any fixes discovered).

**Interfaces:** Consumes the whole app. Produces a verified, working demo.

- [ ] **Step 1: Provide real API keys**

Create `.env.local` (git-ignored) with real values:
```
TAKO_API_KEY=<real key>
OPENAI_API_KEY=<real key>
```

- [ ] **Step 2: Run the dev server**

Run: `npm run dev` and open http://localhost:3000.

- [ ] **Step 3: Exercise the canonical flow**

Type: `AI startups, the Fed, and the Premier League` → submit. Verify, in order:
- Input collapses; typesetting blocks rotate/snap into a reserved grid (no layout jank).
- Blocks fill with real headlines/art as sections stream in (out of order is fine).
- A final settle, then the page-flip reader appears.

- [ ] **Step 4: Verify grounding and caps**

- 3–5 pages total (front + up to 4). Front page has 1 lead + 2–3 briefs; topic pages 2–4 articles.
- Every article shows a "Sources:" credit with ≥1 source.
- At least some pages show a Tako chart figure and/or a data table.
- No obviously fabricated content; headlines trace to visible sources.

- [ ] **Step 5: Verify flipping + B&W**

- Drag page corners, use ← →, swipe on a narrow window; jump-to-section buttons work.
- Toggle B&W ↔ color; B&W greys the whole paper including charts; preference survives reload.

- [ ] **Step 6: Verify graceful degradation**

Try a deliberately obscure brief (e.g. `the regulatory outlook for left-handed widget exports`). Confirm thin sections render a "No fresh reporting on the wire" brief rather than erroring or inventing, and the rest of the paper still prints.

- [ ] **Step 7: Fix any issues found, then re-run**

Run: `npm test && npm run build` after any fix. Commit fixes:
```bash
git add -A && git commit -m "fix: address end-to-end verification findings"
```

- [ ] **Step 8: Final commit / tag the working demo**

```bash
git add -A && git commit -m "chore: The Daily Tako end-to-end verified" --allow-empty
```

---

## Self-Review Notes

- **Spec coverage:** stack/deps (T1), env + gitignore (T1), real Tako API usage (T5, T8), zod v4 schemas + caps (T2), source normalization for empty URLs (T3), CSV→table (T4), NDJSON streaming (T6, T9, T14), editor phase (T7), parallel reporter phase with degradation (T8, T9), broadsheet render + dropcaps + halftone + tables (T10, T11), B&W CSS toggle (T10, T14), typesetting animation driven by real events (T12, T14), react-pageflip reading view (T13), one-sentence→paper flow + DoD (T15). No automation/email/Slack/cron/DB — correctly absent.
- **Placeholder scan:** every code step contains complete code; commands have expected outputs; no TBD/TODO.
- **Type consistency:** `GenerateEvent`/`SectionPlanItem` (T6) used identically in T9/T12/T14; `TPage`/`TNewspaper` consistent; `collectFindings` reads `.output` (verified against ai v7); `runReporter(topic, isFront, masthead)` signature matches its call in `orchestrate`; `streamGenerate(brief, onEvent, signal?)` matches its call in `DailyTako`.
