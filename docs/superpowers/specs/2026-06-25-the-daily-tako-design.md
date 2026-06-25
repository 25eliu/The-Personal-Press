# The Daily Tako — Design Spec

**Date:** 2026-06-25
**Status:** Approved for planning
**Repo:** `The-Personal-Press` (greenfield)

---

## 1. Summary

**The Daily Tako** is a single-page web app: the user types one line describing the news
they want, an AI agent reports/writes/typesets a complete short newspaper grounded in real
sourced data, and the user watches it "print" then flips through it.

The app exists to **showcase `@takoviz/ai-sdk`** — the Tako tools for the Vercel AI SDK. The
agent loop that calls those tools is the heart of the product. The second priority is the
**visual experience**: it must look and feel like a real, slightly cartoony printed
broadsheet, with a satisfying typesetting build animation and an excellent page-flip.

### Scope decisions (confirmed)

- **Primary goal:** showcase the Tako SDK + the newspaper experience.
- **No automation.** No email, no Slack, no cron, no scheduling, no recipe persistence,
  **no database, no auth.** These are explicitly *out of scope* for this build.
- **Single-user demo**, runs locally via `next dev` (Vercel-deployable, but deployment is not
  a goal).
- **Model provider:** **OpenAI** (`@ai-sdk/openai`), default model **`gpt-4.1`**, set in one
  config constant so it is swappable.
- **Page-flip:** **`react-pageflip` (StPageFlip)**.

### Out of scope (do not build)

Email/Resend, Slack, Vercel Cron, scheduling, saved recipes, database/Prisma/KV,
authentication, multi-user, power-user page reordering.

---

## 2. Stack & dependencies

- **Next.js** (App Router) + **TypeScript** + **Tailwind CSS**.
- **Vercel AI SDK:** `ai` (v7 — latest is 7.0.2).
- **`@takoviz/ai-sdk@2.0.0`** — the Tako tools.
- **`@ai-sdk/openai`** — model provider.
- **`zod@^4`** — **required peer dependency of `@takoviz/ai-sdk` is `zod ^4.0.0`** (v4, not v3).
- **`framer-motion`** — typesetting/assembly choreography.
- **`react-pageflip`** — page-flip reading view (client-only; dynamic import with `ssr:false`).

Install:

```bash
npm i @takoviz/ai-sdk ai zod @ai-sdk/openai framer-motion react-pageflip
```

### Environment variables

```
TAKO_API_KEY=     # required by @takoviz/ai-sdk (also accepts TAKO_API_TOKEN)
OPENAI_API_KEY=   # required by @ai-sdk/openai
```

Both keys are **server-side only** — never imported into client components.

### `.gitignore` (explicit requirement)

The repo MUST ignore env files so keys are never committed. Verify the Next.js scaffold's
`.gitignore` already contains, and add if missing:

```
.env
.env*.local
.env.*
```

---

## 3. Ground truth: the real `@takoviz/ai-sdk@2.0.0` API

This section was verified by downloading the package tarball and reading `dist/index.d.ts`
and `README.md`. It **overrides** any conflicting code in the original build prompt. Several
of these differences would have broken a naive one-shot build.

### Exports

```ts
import { takoSearch, takoAnswer, takoContents } from '@takoviz/ai-sdk';
import type {
  TakoRetrievalConfig, TakoContentsConfig,
  TakoSearchResult, TakoAnswerResult, TakoContentsResult,
  TakoCard, TakoWebResult, TakoContentItem,
  TakoKnowledgeCardSource, TakoKnowledgeCardRelevance,
} from '@takoviz/ai-sdk';
```

### Tool factories (config fixed at construction)

`takoSearch(config?)` and `takoAnswer(config?)` take `TakoRetrievalConfig`;
`takoContents(config?)` takes `TakoContentsConfig`. **The LLM supplies only the dynamic
input** — `{ query }` for search/answer, `{ url }` for contents. All other settings (sources,
effort, counts) are fixed when the tool is constructed server-side.

```ts
interface TakoRetrievalConfig {
  apiKey?: string;        // falls back to TAKO_API_KEY / TAKO_API_TOKEN
  baseUrl?: string;       // default "https://trytako.com"
  effort?: 'fast' | 'instant' | 'deep';   // default 'fast'
  sources?: {             // a source is searched iff its key is present; omit to search both
    tako?: { count?: number; includeContents?: boolean; deferDataRetrieval?: boolean };
    web?:  { count?: number; includeContents?: boolean };
  };
  countryCode?: string;   // default 'US'
  locale?: string;        // default 'en-US'
  timezone?: string;      // IANA
  outputSettings?: { imageDarkMode?: boolean; forceRefresh?: boolean };
}

interface TakoContentsConfig {
  apiKey?: string;
  baseUrl?: string;
  mode?: 'url' | 'inline';   // DEFAULT 'url' → presigned link.
                             // We MUST pass mode:'inline' to read CSV in-process.
}
```

### Tool construction we will use

```ts
const tools = {
  tako_search:   takoSearch({  effort: 'fast', sources: { tako: { count: 5 }, web: { count: 5 } } }),
  tako_answer:   takoAnswer({  sources: { tako: { count: 5 }, web: { count: 5 } } }),
  tako_contents: takoContents({ mode: 'inline' }),
};
```

### Bounded tool loop (helper name corrected)

The package README uses **`isStepCount`**, and both `isStepCount` and `stepCountIs` exist in
`ai` v7. We use `isStepCount` to match the README:

```ts
import { generateText, isStepCount } from 'ai';
// ...
stopWhen: isStepCount(6),
```

### Response shapes (the fields we render)

```ts
interface TakoCard {
  card_id?: string | null;
  title?: string | null;
  description?: string | null;
  semantic_description?: string | null;
  webpage_url?: string | null;   // pass to tako_contents; also citation fallback
  image_url?: string | null;     // static chart image → article art
  embed_url?: string | null;     // interactive chart → optional inline embed
  sources?: TakoKnowledgeCardSource[] | null;
  relevance?: 'High' | 'Medium' | 'Low' | null;
  card_type?: string | null;
  content?: { format: 'csv'|'text'; data?: string|null; total_rows?: number|null; truncated?: boolean } | null;
}

interface TakoKnowledgeCardSource {
  source_name: string | null;
  source_description: string | null;
  source_index: string | { index_type: string; segment_id?: string }
              | { index_type: string; private_index_id: string; segment_id?: string | null }; // string OR object
  url: string | null;            // FREQUENTLY null/empty on Tako cards
  source_text?: string | null;
}

interface TakoWebResult {
  title: string;
  url: string;
  snippet?: string | null;
  source_name?: string | null;
  publish_date?: string | null; // nullable
}

// takoSearch  → { cards, web_results, contents_total_cost, request_id }
// takoAnswer  → { answer, cards, web_results, contents_total_cost, request_id }  (cards[0] = lead)
// takoContents→ { contents: TakoContentItem[], request_id }
//   TakoContentItem: { format, data?, total_rows?, truncated?, source_url, url?, expires_at? }
```

### Hardening rules derived from the live API probe

1. **Empty source URLs.** `source.url` is `string | null` and is *frequently empty* on Tako
   cards (confirmed live: "Federal Reserve Bank of St. Louis" returned `url: ""`). A
   `normalizeSources()` helper MUST drop empty/`null` URLs and fall back to the card's
   `webpage_url`. Never pass an empty string into a Zod `.url()` validator.
2. **`source_index` polymorphism.** It may be a plain string or an object — normalize to a
   string label; do not assume a shape.
3. **`relevance`** (`High|Medium|Low`) is used to choose the lead article on a page.
4. **`publish_date`** (nullable) is shown on web-sourced briefs only when present.
5. **CSV is lazy.** `card.content.data` is `null` until fetched via `tako_contents({mode:'inline'})`.
   Always check `truncated`/`total_rows`.

---

## 4. Architecture

```
Browser (single page, client state machine)
   │  POST /api/generate  { brief }
   ▼
Next.js route handler  (server-only; holds API keys)
   ├─ Phase 1: Editor   → generateObject → SectionPlan        ─emit→ editor_done
   └─ Phase 2: Reporters (parallel, Promise.allSettled)
        per section:  generateText tool-loop (3 Tako tools)    ─emit→ section_started
                      → generateObject distill → Page          ─emit→ section_done
   ▼
NDJSON event stream (ReadableStream)  ──────────────────────────emit→ complete | error
```

**Streaming model.** `/api/generate` runs the orchestration and writes typed JSON events
line-by-line to a `ReadableStream`; the client reads them with a `fetch` body reader. No extra
deps; full control of event shape; maps directly onto the typesetting choreography. (Rejected:
AI SDK data-stream protocol — built for single-model token streams; polling — laggy, fake-feeling.)

**No persistence layer.** Only `localStorage` on the client for the B&W toggle preference and
the last brief (refresh convenience). Nothing server-side is stored.

---

## 5. The agent pipeline

### Phase 1 — Editor (`generateObject`, `gpt-4.1`)

Input: the user's one-line brief. Output: masthead name, tagline, edition, dateLine, and an
**ordered section plan** (front page + up to 4 topic pages → **max 5 pages**). Caps enforced
here. On success → emit `editor_done` carrying the masthead + plan so the client immediately
lays out empty typeset blocks for every planned page.

### Phase 2 — Reporters (one per section, parallel)

Run with `Promise.allSettled` so **a failed reporter never blocks the rest of the paper.**
Each reporter:

1. A bounded `generateText` **tool loop** (`stopWhen: isStepCount(6)`) with all three Tako
   tools constructed server-side from `TAKO_API_KEY`.
2. System prompt enforces grounding: prefer Tako (`tako_search`/`tako_answer`) for any concrete
   data point (values, time series, prices, scores, polls, forecasts); use web results for
   narrative/context; **draw on both Tako and web while researching**; never invent — every
   article must trace to a returned card, answer, or web result.
3. When a section benefits from raw numbers, the loop calls `tako_contents({mode:'inline'})` on
   a card's `webpage_url`, then `csvToTable()` parses `contents[0].data` into a `TableData`.
4. A short `generateObject` **distill** pass turns gathered findings into a typed `Page`
   (article + word caps applied). Attaches `image_url`/`embed_url` as art and normalized sources.
5. Emits `section_started` then `section_done` (with the finished `Page`) so blocks fill in
   real time and out of order.

**Sourcing rule (clarified).** Both Tako and web should be *used in research*; this is **not** a
rendering constraint — we do not force both to literally appear on the page. The only hard
render rule: **every article cites ≥1 source.**

**Degradation.** A thin or failed section renders a single `brief` reading "No fresh reporting
on the wire" rather than padding or inventing.

### Data model (Zod v4)

```ts
const Source   = z.object({ name: z.string(), url: z.string().url().optional() });
const TableData = z.object({
  caption: z.string(),
  columns: z.array(z.string()),
  rows: z.array(z.array(z.string())),
});
const Article  = z.object({
  kicker:   z.string(),
  headline: z.string(),
  dek:      z.string().optional(),
  byline:   z.string().default('Tako Wire'),
  body:     z.string(),
  size:     z.enum(['lead','standard','brief']),
  chartImageUrl: z.string().url().optional(),
  chartEmbedUrl: z.string().url().optional(),
  table:    TableData.optional(),
  sources:  z.array(Source).min(1),   // grounding mandatory
});
const Page = z.object({ topic: z.string(), articles: z.array(Article) });
const Newspaper = z.object({
  masthead: z.string(), tagline: z.string(), edition: z.string(), dateLine: z.string(),
  pages: z.array(Page),
});
```

> Note: `Source.url` stays optional and is only populated by `normalizeSources()` with a valid,
> non-empty URL (card `webpage_url` fallback). Empty strings must be stripped *before* Zod
> validation, or `.url()` will throw on real Tako data.

### Hard length / size caps

- **Pages:** front page + up to **4** topic pages (**max 5**).
- **Front page:** 1 `lead` + 2–3 `brief`s.
- **Topic page:** 2–4 articles.
- **Words:** `lead` ≤ 180, `standard` ≤ 110, `brief` ≤ 60.
- Target total read time ≈ 5 minutes.

### Streaming event protocol (NDJSON)

```ts
type GenerateEvent =
  | { type: 'editor_done';     masthead: string; tagline: string; edition: string;
                               dateLine: string; plan: { topic: string; slot: number }[] }
  | { type: 'section_started'; slot: number; topic: string }
  | { type: 'section_done';    slot: number; page: Page }
  | { type: 'error';           slot?: number; message: string }
  | { type: 'complete';        newspaper: Newspaper };
```

---

## 6. Visual experience & render

### Aesthetic — cartoony broadsheet

Cream paper with subtle grain, true-black ink, hairline column rules, bold ink-outlined section
dividers, oversized headlines, **drop caps** on lead paragraphs, **halftone-dot** treatment on
figures, pull-quotes. Playful, old-timey, not corporate.

- **Masthead:** big blackletter/condensed-serif title (UnifrakturCook + Playfair pairing), thin
  date + edition rule beneath, optional tiny ticker strip.
- **Body type:** classic serif (Playfair / Georgia / Old Standard TT), justified multi-column
  with real gutters and rules.
- **Charts/tables:** Tako `image_url` as framed figures with caption + source credit; tables
  styled like printed data tables.

### B&W "timeless mode" toggle

Top-corner control. **B&W is a pure CSS treatment** over the whole paper (`filter: grayscale` +
halftone overlay) — default on. **Color** = restrained spot color. No API involvement.
(`imageDarkMode`/`?dark_mode=true` is explicitly *not* used: it produces dark-background charts,
which is wrong for a cream broadsheet.) Preference persisted to `localStorage`.

### Build animation (Framer Motion) — driven by real stream events

1. On submit, the input line collapses; on `editor_done`, empty column/headline/figure blocks
   **rotate & snap into a reserved grid** (staggered `rotateY`/`y`/opacity) — type being set.
2. As each `section_done` streams in, the corresponding blocks **fill with real content**.
3. On `complete`, a quick "ink-set / paper-drop" flourish settles the paper.
4. **Layout space is reserved up front** from the section plan so there is **no reflow jank**.

### Reading & flipping

`react-pageflip` (dynamic import, `ssr:false`): realistic curl/peel, draggable corners, arrow
keys, swipe, optional page-turn sound (**muted by default**), page indicator + jump-to-section.
Mobile = single page with swipe.

---

## 7. File layout (many small, focused files)

```
app/
  page.tsx                      # client state machine: idle → typesetting → printing → reading
  api/generate/route.ts         # orchestrator: editor → parallel reporters → NDJSON stream
  layout.tsx, globals.css       # fonts, paper texture, halftone utilities

lib/
  config.ts                     # MODEL constant, caps, source counts
  schema.ts                     # zod v4 schemas (Newspaper, Page, Article, ...)
  tako/
    tools.ts                    # construct takoSearch/takoAnswer/takoContents
    normalize.ts                # normalizeSources(), source_index → label, url fallback
    csv-to-table.ts             # parse inline CSV → TableData
  agents/
    editor.ts                   # generateObject → SectionPlan
    reporter.ts                 # tool loop + generateObject distill → Page
    prompts.ts                  # editor + reporter system prompts (grounding rules)
  stream/
    events.ts                   # GenerateEvent types
    ndjson.ts                   # encode/emit + client reader helper

components/
  BriefInput.tsx
  BWToggle.tsx
  newspaper/  Masthead, NewspaperPage, Article, Figure, DataTable, DropCap, PullQuote, SourceCredit
  build/      TypesettingStage, ColumnBlock (skeleton blocks)
  flip/       PageFlipReader
```

Constraints from coding style: immutable data (return new objects), files ~200–400 lines
(800 max), functions < 50 lines, comprehensive error handling at boundaries, validate all
external data (Tako responses) before use.

---

## 8. Guardrails

- Grounded only in returned Tako cards / answers / web results. **No fabrication.** Every
  article cites ≥1 source.
- Both Tako and web are **used in research** (not a render constraint).
- Respect all size/length caps.
- Graceful failure: a thin section degrades to a brief or "No fresh reporting on the wire"; a
  failed reporter never blocks the rest of the paper.
- `TAKO_API_KEY` and `OPENAI_API_KEY` stay server-side only; env files git-ignored.

---

## 9. Definition of done

Type "AI startups, the Fed, and the Premier League" → watch the paper typeset itself from real
streamed agent events → flip through ~3–5 grounded pages with charts/tables and real sources
from Tako + the web → toggle to timeless B&W. All running locally via `next dev`. No
fabrication; every article sourced; all caps respected.

---

## 10. Acceptance checklist

1. Scaffold Next.js + TS + Tailwind + deps; wire `TAKO_API_KEY` + `OPENAI_API_KEY`; verify
   `.gitignore` excludes env files.
2. `lib/tako/tools.ts` constructs all three tools against the real v2.0.0 API; `normalize.ts`
   + `csv-to-table.ts` handle empty source URLs, polymorphic `source_index`, lazy CSV.
3. Editor `generateObject` → section plan with caps enforced.
4. Parallel reporter tool-loops (`isStepCount(6)`, all 3 tools) → distilled typed `Page`s with
   normalized sources; NDJSON progress events streamed.
5. Newspaper renderer: masthead, multi-column type, drop caps, halftone figures, tables, B&W
   CSS toggle — reads as a real cartoony broadsheet.
6. Typesetting build animation (rotating blocks → fill → print) driven by real stream events,
   no reflow.
7. `react-pageflip` reading view (curl, drag, keys, swipe, mobile).
8. Verify end-to-end against the Definition of Done.
