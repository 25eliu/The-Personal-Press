# Graph Fit, General Prompts & Click-to-Flip — Design

**Date:** 2026-06-28
**Status:** Approved (brainstorming) → ready for implementation plan

## Context

Dogfooding the generated editions surfaced three problems:

1. **Graphs that don't make sense and get cut off.** A ceasefire prediction-market card is a *daily
   time series* (May 14 → Jun 7, probabilities) but rendered as a 25-row `ScheduleCard`. `ScheduleCard`
   has no row cap, so it overflows the page and is clipped at the spread edge; its values show as
   truncated "0…" instead of a line. A dense date-indexed run like this should be a **line chart**, and
   schedules should be short event lists. Some recharts charts also clip their end axis label at the
   figure edge.
2. **Precached prompts are too specific.** The example briefs name entities ("fifa", "SpaceX", "Tesla",
   "OpenAI", "the yen"). The user wants broad, general news beats so every section reliably has
   Tako-backed data and a sensible chart.
3. **No way to jump to a change.** When the CopilotKit chatbot edits an article, updates a graphic, or
   adds a section, there is no way to click the result and have the reader flip to where it changed.

**Out of scope (explicitly dropped):** dedicated "smarter copilot section research." `addSection`
already runs the same reporter → `finalizePage` → `cleanTable` → `pickGraphic` pipeline, so it inherits
every graph-quality fix below for free — but no copilot-research-specific work is part of this spec.

## Goals

- Every data graphic reads sensibly and stays inside its figure/page — no overflow, no clipped labels,
  no 25-row date lists.
- The precached example prompts are general news beats; their sections produce real Tako-grounded charts.
- A chat result that changed the paper offers an explicit **"↳ See it in '{section}'"** link that flips
  the reader to that section.

## Design

### A. Graphs that make sense + never cut off

**Routing (`lib/newspaper/graphic.ts`, `lib/newspaper/tableShape.ts`):**
- `isSchedule` becomes "short event list only": require a bounded row count (`SCHEDULE_MAX_ROWS` ≈ 12)
  in addition to the existing date-column + non-prose + distinct-titles checks. A long date-indexed run
  no longer routes to a schedule.
- A dense date-indexed series with a numeric value routes to the existing line/area `chart`. Strengthen
  numeric detection so small decimals / probabilities (`0.0025`, `0.25%`, `<0.01`) count as a chartable
  series rather than a text "title" — extend `parseNumeric`/`isNumericColumn` handling in `tableShape.ts`.
- A long date+text run with no numeric series falls back to the capped `DataTable` (clean, bounded).

**Rendering (`components/newspaper/`):**
- `ScheduleCard.tsx`: cap to ~10 rows + a muted "+N more" line (matching `DataTable`/`StandingsTable`),
  so a schedule can never spill past the page edge.
- `NewsChart.tsx` / `ScatterPlot.tsx`: tighten the draw width / margins so the first and last axis labels
  sit inside the plot; `GraphicFigure`'s `overflow-hidden` remains the hard backstop. No chart bleeds
  past its border or the column.

### B. General precached prompts (`lib/edition/examples.ts`)

Replace `EXAMPLE_POOL` / `PINNED_BRIEF` with broad, general beats (each brief = 3 comma-separated beats):

- Pinned: `world news, business, technology`
- Pool (representative): `world news, business, sports` · `technology, markets, science` ·
  `politics, health, culture` · `the economy, climate, global sport` · plus a few more general
  combinations to keep the daily rotation varied.

These are beats Tako reliably has data for, so each generated section ships a real, data-backed chart.
The distill prompt already pulls `tako_contents` CSV and charts it; reinforce "pull the data card and
chart it" in `lib/agents/reporter.ts` / `lib/agents/prompts.ts` so data-backed graphics stay the norm.
Membership checks (`isExampleBrief`, `getDailyBriefs`) and the 6h replay cache keep working unchanged.

### C. Click-to-flip (new feature)

When a chat action changes the paper, its `ResearchProgress` result bubble shows a footer link
**"↳ See it in '{section}'"** that flips the reader to that section's spread.

**State + wiring (prop-drilling, matching the existing `edition`/`dispatch` pattern):**
- `DailyTako.tsx` holds a small `flipTo: { slot: number; nonce: number } | null` state.
- A `requestFlip(slot)` callback is passed down into `useEditionCopilot` (through `CopilotBridge.tsx`,
  exactly like `dispatch` is already drilled). Calling it bumps `nonce` and sets `slot`.
- `flipTo` is passed down into `PaginatedReader` (through `NewspaperView.tsx`). A `useEffect` keyed on
  `flipTo.nonce` maps `slot → spread` via the reader's existing `topics` memo
  (`Math.floor(firstLeafIndex / 2)`) and triggers the page-turn animation (reusing the `setFlip`/
  `setSpread` path that the section-nav chips already use).

**Bubble (`components/copilot/ResearchProgress.tsx`, `lib/edition/useEditionCopilot.ts`):**
- `ResearchProgress` gains optional `slot?: number`, `sectionLabel?: string`, and
  `onNavigate?: (slot: number) => void`. When `slot` and `onNavigate` are present it renders the footer
  link; clicking calls `onNavigate(slot)`.
- `useEditionCopilot` threads each action's known `slot` + the target section's topic (from
  `state.pages[slot].topic`) into the render, and passes `requestFlip` as `onNavigate`. Covers
  `editArticle`, `addChart`, `editGraphic`, `addSection` (resolved insert slot), `replaceWithResearch`,
  `replaceArticleWithResearch`, `refreshChart`.
- Slot resolution is best-effort: the link flips to whatever currently occupies that slot (good for the
  common case of clicking right after a change); a later reorder may shift it.

## Key files

- `lib/newspaper/graphic.ts`, `lib/newspaper/tableShape.ts` — schedule row cap + numeric detection.
- `components/newspaper/ScheduleCard.tsx`, `NewsChart.tsx`, `ScatterPlot.tsx` — caps + containment.
- `lib/edition/examples.ts` — general prompt pool.
- `lib/agents/reporter.ts`, `lib/agents/prompts.ts` — reinforce data-card charting.
- `components/DailyTako.tsx`, `components/copilot/CopilotBridge.tsx`, `lib/edition/useEditionCopilot.ts`,
  `components/copilot/ResearchProgress.tsx`, `components/newspaper/NewspaperView.tsx`,
  `components/newspaper/PaginatedReader.tsx` — click-to-flip chain.

## Reuse, not rebuild

- `cleanTable`/`pickGraphic`/`GraphicFigure`/`GraphicView` structure and the per-renderer row-cap +
  "+N more" pattern already in `DataTable`/`StandingsTable`.
- The reader's existing `topics` memo and `setSpread`/`setFlip` page-turn animation for navigation.
- The `edition`/`dispatch` prop-drilling path through `CopilotBridge` for the `requestFlip` callback.

## Verification

- `npm test` — new/updated unit tests: a long date-indexed series → `chart` (not `schedule`); schedule
  row cap; small-decimal numeric detection; `examples.ts` pool is all-general (no banned specific
  tokens). Existing routing tests stay green. `npm run build` + `tsc` clean.
- `/browse` the running app: regenerate a general prompt (clear `localStorage['tako-example-editions']`),
  confirm no overflowing schedule, the ceasefire-style series renders as a contained line chart, and
  charts stay inside their boxes. Then via the Copy Desk: make an edit / add a chart / add a section and
  click the bubble's "↳ See it in '{section}'" link — the reader flips to that section.
