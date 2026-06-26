# Spec: Fresh data + Tako/Web pairing

**Date:** 2026-06-25
**Goal:** Stop the paper (and chat) from reporting stale news. Make every Tako-backed
surface use the *latest* data, and fuse Tako's hard numbers with the web's narrative
into higher-quality articles.

## Root cause

Nothing in the pipeline knows the current date, so the model defaults to its
training-era memory:

1. The editor **invents** `dateLine` (`prompts.ts`) — it has no real date, so it
   fabricates an old one.
2. No query is framed for recency. The reporter (`reporter.ts`) and chat answerer
   (`answer.ts`) ask Tako/web for a topic with **zero temporal anchor**.
3. `publish_date` is collected into the distill JSON but **never used** to filter or
   rank. Stale web results get written up as current.
4. Tako and web are dumped into one flat blob — **never paired**. The distill step
   sees two arrays and no per-story fusion.

## SDK constraints (verified)

- `TakoWebResult.publish_date?: string | null` exists → the freshness signal we filter/rank on.
- `TakoCard` has **no date** field (has `relevance: High|Medium|Low`, `sources`). Cards
  are live datasets → treated as *current*, ranked by `relevance`.
- `takoSearch` has **no time-range param** (only `effort`, `sources`, `country`). Recency
  therefore comes from: real-date injection + query phrasing + web `publish_date` filtering.

## Decisions

- **Freshness window:** 7 days. Prefer last-7-days data; down-rank older.
- **Pairing:** dedicated synthesis step producing per-story bundles, between gather and distill.
- **Scope:** Reporter (full treatment) + Chat Q&A (lighter: date anchor + recency only).
  `/api/edit-section` inherits the reporter fix via `runReporter`.
- **Stale-only fork:** (b) when nothing is within 7 days, run the freshest available older
  data stamped "as of {date}" rather than a blank "No fresh reporting" page.

## Design

### 1. Real-date foundation — `lib/time/clock.ts`

`todayContext(now?)` → `{ iso: "2026-06-25", dateLine: "Thursday, June 25, 2026", windowDays: 7 }`.
Stamped **once** per run in `orchestrate` and threaded to editor + every reporter + chat
answerer, so the whole edition is internally consistent.

- `runEditor` overrides the model's `dateLine` with the real one (same pattern as `masthead`).
  `editorPrompt` gains "Today is {dateLine}; plan sections as of today."
- Reporter + Answer system prompts gain: *"Today is {dateLine}. Pull the LATEST data and
  strongly prefer sources from the last 7 days. Frame every query for current/latest values."*

### 2. Freshness scoring — `lib/freshness.ts`

Pure, tested helpers over web `publish_date`:
- `daysAgo(date, today): number | null` (null when undated/unparseable)
- `isStale(date, today, windowDays): boolean` (undated → not stale)
- `freshnessLabel(date): string | undefined` → "as of Jun 24"

Tako cards: no date → current; ranked by `relevance`. Undated web: neutral (kept, ranked
below dated-fresh, above dated-stale). Never auto-reject solely for missing a date.

### 3. Synthesis step — `lib/agents/synthesize.ts`

New stage between gather and distill. One `generateObject` call produces story bundles:

```
StoryBundle = {
  title, summary,
  dataPoints: [{ label, value, sourceName, date? }],   // from Tako cards
  narrative:  [{ point, sourceName, date? }],           // from web
  sources: TSource[],
  newestDate?, isFresh   // computed code-side via freshness.ts
}
```

Model clusters cards + web into coherent stories and attaches each Tako number to the web
narrative about the same story. Code-side then computes `newestDate`/`isFresh`, **drops stale
bundles when fresher ones exist**, ranks fresh-first. If *all* bundles are stale, keep the
freshest and let distill stamp "as of {date}" (fork b). `distill` writes articles **from
bundles** → every article is data+narrative+sources by construction.

### 4. Data flow / errors / tests

- **Flow:** `orchestrate(today)` → `editor(today)` → per page `gather → synthesize(today) →
  distill(bundles) → attachArt/sanitize`.
- **Chat:** date anchor + recency instruction only (no full synthesis).
- **Errors:** synthesis failure → fall back to today's flat-blob distill (paper never breaks);
  wrapped in existing try/catch + `logCall`.
- **Tests:** unit for `clock` + `freshness` math + bundle staleness filtering/ranking;
  `synthesize` post-processing with mocked findings asserting pairing & stale-drop.
