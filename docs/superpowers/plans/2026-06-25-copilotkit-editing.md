# Plan: Conversational newspaper editing with CopilotKit

**Date:** 2026-06-25
**Goal:** Add a chat panel beside the newspaper that reads the current edition and edits it on the user's request ("make the Fed lead punchier", "add a sports page", "redraw that chart").

## Why CopilotKit fits

The Daily Tako is currently a one-shot generator: a brief goes in, the `editor → reporter` pipeline runs, and typed `TPage` objects stream over NDJSON into a fixed newspaper layout. The generation layer is solid and should not change.

What's missing is an *interaction* layer for iterating on a finished paper. That is exactly CopilotKit's sweet spot, via three primitives:

- **`CopilotSidebar`** — a docked chat panel next to `NewspaperView`.
- **`useCopilotReadable`** — feeds the copilot the current `meta` + `pages` state so it knows what it's editing.
- **`useCopilotAction`** — registers frontend actions (`editArticle`, `addSection`, `rewriteArticle`, …) that the LLM calls with structured args; the handler mutates the same React state that renders the paper. The action's `render` option provides the "generative UI" preview inside chat.

CopilotKit replaces the interaction layer, **not** the generation layer. `orchestrate` / `runReporter` / the Tako tools stay as-is and become tools the copilot can call.

## Two flavors of edit

**Local edits (no new data).** "Make the Fed lead punchier", "cut this to a brief", "drop the third story", "reorder sections". The copilot rewrites/restructures existing `TPage` content directly in the action handler. Cheap, instant, no Tako call.

**Research-backed edits (need fresh data).** "Add a sports page", "redraw that chart with newer numbers", "find a source for this claim". These call back into the existing pipeline: `runReporter(topic, …)` already returns a `TPage`. The action handler hits a small server route that runs one reporter and merges the result into `pages`, reusing the editor/reporter/Tako machinery.

## Phases

### Phase 0 — Spike (½ day)
- `npx copilotkit@latest skills onboard` against the repo.
- Add `<CopilotKit runtimeUrl="/api/copilotkit">` with a self-hosted Copilot Runtime route using the existing `OPENAI_API_KEY`.
- Drop a `CopilotSidebar` into `DailyTako`.
- Wire one trivial action (`setMasthead`) editing live state end-to-end.
- **Skip** the CLI's Cloud-Hosted Enterprise Intelligence path — no need for hosted threads yet; it adds a paid dependency + vendor lock-in.

### Phase 1 — Make state editable
- Today `DailyTako` owns `pages` / `meta` and only ever *sets* them from the stream.
- Refactor edits into a first-class reducer (`applyEdit`) over `{ meta, plan, pages }`.
- Expose current state via `useCopilotReadable`.
- No CopilotKit edit logic yet — just a clean mutable model.

### Phase 2 — Local-edit actions
- Register `useCopilotAction` for no-research edits: `editArticle`, `rewriteArticle(tone)`, `setArticleSize`, `removeArticle`, `addPullQuote`, `reorderSections`.
- Each validates against the zod `Article` / `Page` schema before committing, so the copilot cannot produce an invalid paper.
- Use the action `render` to preview the new article in chat before applying.

### Phase 3 — Research-backed actions
- Add `addSection(topic)` and `refreshChart(articleId)` actions.
- Handlers call a new `/api/edit-section` route → `runReporter()` → merge the returned `TPage`.
- Stream its `tool_activity` into the chat so the user sees "Using Tako search…" mid-edit, reusing the existing event types.

### Phase 4 — Polish
- Source-integrity guardrail: every edited article keeps ≥1 valid source via `sanitizePage`.
- Undo via reducer history.
- System prompt teaching the copilot house style + word caps from `config.ts`.

## Guardrails / watch-outs

- Keep `orchestrate` / `runReporter` / Tako exactly as-is — they become tools, not rewrites.
- The initial "enter a brief → build the paper" flow stays on the NDJSON stream, untouched. CopilotKit only owns the post-generation editing conversation.
- Avoid Cloud-Hosted Enterprise Intelligence for now; self-hosted Copilot Runtime covers everything in this plan.
- Validate every copilot-produced article against the existing zod schemas before committing to state.

## Open questions

- Should edits be auto-applied or require a confirm step (preview-then-apply)?
- Do we eventually want persistence (saved editions / resumable threads)? That's the one place the Cloud path would later earn its keep.
