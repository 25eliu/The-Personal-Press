# Spec: Chat-agent research quality, model upgrade, and streaming

**Date:** 2026-06-25
**Status:** Approved (brainstorming) → ready for implementation plan

## Context

The Copy Desk copilot can already edit the newspaper (rewrite, remove, reorder) and run Tako-backed research edits (`addSection`, `replaceWithResearch`, `refreshChart`) plus live Q&A (`askTako`). But the research path has three problems observed in use:

1. **Tako queries drift off-topic.** Asked to "add a section that explains the summer-league-transfers thing more in depth," the reporter searched Tako for *"FIFA World Cup 2026 latest group stage standings…"* — a different, more "current" football story. Root cause: every research prompt injects `recencyInstruction` (`lib/time/clock.ts:37`), which tells the model to "frame every Tako/web query for current/latest values." That recency pressure overpowered the assigned topic and steered it to the biggest live football event. The reporter also freelances its own queries inside one `generateText` call, so once it drifts, every query is wrong.

2. **No access to the document.** `runReporter(topic, …)` receives only a topic *string* (`lib/agents/reporter.ts:115`). The chat LLM can see article text via `useCopilotReadable`, but that context is never forwarded into the research pipeline. So "explain X **more in depth**" cannot build on what's already printed — the reporter can't see it.

3. **Slow and unstreamed.** A section runs three sequential LLM calls — research → `synthesizeBundles` → distill — on `gpt-4.1`, and the result only appears after all three finish (~15s). The `askTako` path already streams tokens; sections do not.

This spec fixes all three: on-topic + document-grounded research, a current cost-optimized model, and a trimmed, streamed section pipeline.

## Decisions (from brainstorming)

- **Grounding scope:** relevant section(s) only (not the whole paper).
- **Model:** `gpt-5.4-mini` everywhere (single `MODEL` constant).
- **Latency:** both — stream the section draft into the chat *and* drop the separate `synthesize` call.

## Part A — On-topic search + document grounding

### A1. Forward the referenced section's real text as grounding context

- Research actions in `lib/edition/useEditionCopilot.ts` (`addSection`, `replaceWithResearch`) gain an optional **`groundingSlot: number`** parameter. The chat LLM only chooses *which existing section the command refers to*; it does not transcribe text.
- The action **handler reads that page's actual articles from `stateRef.current.pages[groundingSlot]`** and serializes them (topic + each article's kicker/headline/dek/body) into a `context` string. Reading from state guarantees fidelity — no LLM transcription drift.
- `context` flows: action → `streamEditSection({ topic, isFront, context })` → `POST /api/edit-section` body `{ topic, isFront, context }` → `runReporter(topic, isFront, masthead, today, { context, … })`.
- `refreshChart` already targets a `slot`; it passes that page's text as `context` automatically.

### A2. `runReporter` injects grounding into research and writing

- `runReporter` signature becomes options-style: `runReporter(topic, isFront, masthead, today, opts?)` where
  `opts = { context?: string; onActivity?: (a: ReporterActivity) => void; onDraftToken?: (t: string) => void; signal?: AbortSignal }`.
  Move the current positional `onActivity`/`signal` into `opts` and update **both** callers — `lib/agents/orchestrate.ts` and `app/api/edit-section/route.ts`.
- When `context` is present, both the research prompt and the distill prompt get a block:
  *"This section must build on / go deeper than the reader's EXISTING coverage below. Research and write specifically about that subject; do not drift to an adjacent topic.\n\nEXISTING COVERAGE:\n<context>"*

### A3. Topic-primary prompts (recency scoped within the topic)

- Rework `recencyInstruction` (`lib/time/clock.ts`) and `reporterSystem` (`lib/agents/prompts.ts`) so the **assigned topic is primary** and recency applies *within* it:
  *"Your assigned topic is fixed. Stay strictly on it. Search Tako for the latest data ABOUT THIS TOPIC — include the current year for freshness — but never substitute a different, more 'current' story for the assigned one."*
- Keep `askTako`/`answerStream` recency as-is (a free-form question genuinely wants the latest), but ensure the reporter's recency no longer says "frame every query for latest/today" without a topic anchor.

**Acceptance:** "explain the summer-transfers thing more in depth" → `addSection({ topic: "Premier League summer transfer window 2026 — in-depth", groundingSlot: <football slot> })` → Tako searches Premier-League-transfer queries, and the new section builds on the existing football coverage.

## Part B — Model upgrade

- `lib/config.ts`: `MODEL = 'gpt-5.4-mini'` (from `gpt-4.1`). Every stage (`reporter` research + distill, `editor`, `askTako`/`answerStream`) reads `MODEL`, so all upgrade together.
- **Verification risk (must check during implementation):** gpt-5 models can differ from gpt-4.1 under `@ai-sdk/openai` — API routing (Responses vs Chat Completions), temperature support, and structured-output flags. Confirm on `gpt-5.4-mini`:
  - `generateText` with Tako tools + `stopWhen: isStepCount(...)` still does multi-step tool calls.
  - `generateObject` / `streamObject` with `providerOptions.openai.strictJsonSchema: false` still validates against the `Page` schema.
  - If the SDK requires the Responses API or a param change, adjust the model factory (e.g. `openai.responses(MODEL)`) in one place.

## Part C — Latency: trim the pipeline + stream the draft

### C1. Drop the separate `synthesize` call

- Remove the `synthesizeBundles` LLM call from `runReporter` (`lib/agents/reporter.ts:158-166`). Fold its intent — pair Tako numbers (dataPoints) with web narrative, freshest-first, stamp non-fresh "as of" dates — directly into the **distill prompt** so the single distillation does the pairing in one pass.
- `lib/agents/synthesize.ts` is no longer called by the reporter; remove the call (the module may be deleted if unused elsewhere — check imports first).
- Applies to BOTH paths (initial generation via `orchestrate` and chat edits), so the whole app gets one fewer round-trip.

### C2. Stream the section draft into the chat (chat-edit path only)

- Distillation gains a streaming mode. When `runReporter` is called with `opts.onDraftToken`, distill with **`streamObject({ schema: Page })`**: subscribe to `partialObjectStream`, and as the partial articles' headline/body text grows, emit the **delta of the concatenated prose** via `onDraftToken`. On finish, validate the full `Page` and return it as today. When `onDraftToken` is absent (initial generation via `orchestrate`), keep `generateObject` exactly as now.
- Section stream protocol: extend the `/api/edit-section` event set with a **`token`** event (prose delta) alongside the existing `tool_activity` / `section_done` / `error`. Mirror the `askEvents` pattern the codebase already uses — either add `token` to a dedicated edit-section event union or reuse the `AskEvent`-style shape. `editClient.ts` forwards `token` deltas to the action.
- In `useEditionCopilot.ts`, `runResearch` accumulates `token` deltas into the existing `researchAnswer` state, and `ResearchProgress` (which already renders streamed `answer` prose with a blinking caret) shows the section forming token-by-token. On `section_done`, the structured page is validated and dispatched to the reducer as today.

**Result:** research (Tako activity streams) → distill (prose streams into the chat bubble) → section lands on the page. One generation, visibly streamed, one fewer LLM call.

## Components & interfaces

| File | Change |
|------|--------|
| `lib/config.ts` | `MODEL = 'gpt-5.4-mini'` |
| `lib/time/clock.ts` | `recencyInstruction` → topic-primary wording |
| `lib/agents/prompts.ts` | `reporterSystem` topic-anchored; grounding block helper |
| `lib/agents/reporter.ts` | options arg (`context`, `onDraftToken`); drop synthesize; fold pairing into distill prompt; `streamObject` when streaming |
| `lib/agents/synthesize.ts` | call removed (delete module if no other importers) |
| `app/api/edit-section/route.ts` | accept `context`; emit `token` events from `onDraftToken` |
| `lib/stream/*` (events/editClient) | carry `context` + `token` deltas for the section path |
| `lib/edition/useEditionCopilot.ts` | `groundingSlot` param on research actions; serialize grounding from state; stream draft into `researchAnswer` |
| `lib/edition/instructions.ts` | teach: pass `groundingSlot` for "more in depth"/references; stay on-topic |
| `lib/agents/orchestrate.ts` | update `runReporter` call to options form (no context, no streaming) |

## Error handling

- Grounding is optional: missing/invalid `groundingSlot` → research proceeds with topic only (no crash).
- `streamObject` failure or partial-parse error → fall back to a final `generateObject` (or surface `error` event); the page must never be left half-applied. Reuse existing `validatePage` + `hasRealContent` guards before dispatch.
- Model-incompat errors (Part B) surface as the existing reporter `error` path → `emptyPage` / chat error string, never a crash.

## Testing & verification

- **Unit:** prompt builders include the grounding block when `context` is provided and omit it otherwise; topic-primary recency string no longer contains the "frame every query for latest" directive. Existing reducer/schema tests stay green.
- **Build/type:** `npx tsc --noEmit`, `npm run build`, `npx eslint` on changed files; `npm run test`.
- **Live (browse + server logs):**
  1. **On-topic + grounding:** demo/real paper with a football section → "add a section explaining the summer transfers in more depth, underneath" → server log shows `tool.call` queries about *Premier League transfers* (not World Cup); new section appears under the referenced one and reads as a deeper take.
  2. **Model:** server logs show `model: gpt-5.4-mini`; research + distill succeed (tool calls + valid `Page`).
  3. **Latency/stream:** `synthesize` no longer logged; the chat bubble streams the section prose token-by-token before it lands on the page; wall-clock from request to section visibly lower than the prior ~15s.
  4. **Regression:** `askTako`, local edits, `replaceWithResearch` (whole-section) still work; initial paper generation unchanged.

## Risks / watch-outs

- **gpt-5.4-mini API differences** (Part B) — the single biggest unknown; verify tool-calling + structured output early before building the rest.
- **Removing `synthesize`** trades a small quality step for speed; the pairing instruction must be preserved in the distill prompt so numbers still pair with narrative.
- **`streamObject` partial prose** can look choppy (JSON fields fill out of order); derive the draft text from stable fields (headline then body, per article in order) so the streamed preview reads naturally.
