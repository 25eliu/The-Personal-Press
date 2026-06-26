# Tako: drop redundant `tako_answer`, time-aware queries, consolidated Q&A

**Date:** 2026-06-26
**Status:** Approved — implementing

## Problem

1. **`tako_answer` is a redundant paid LLM pass.** The SDK defines `takoAnswer` as
   `takoSearch` + an LLM-synthesized answer. Both call sites already run their own
   LLM over the raw findings (the reporter's distill, the chat's `generateText`),
   so the synthesized `answer` string is re-written anyway.
2. **Stale graphs (FIFA → 2022).** Tako *cards carry no date field* — the only
   recency lever is the query, and today recency is enforced only by a prompt
   nudge the model forgets. Vague one-word queries ("FIFA") make Tako return its
   evergreen "notable" card, often years old.
3. **Redundant Q&A code.** Three Tako paths exist; `lib/tako/answer.ts` is dead
   (nothing imports it) and duplicates `answerStream.ts` (`answerSystem`,
   `dedupeSources`, the `answers` fallback).

## Design

### Part 1 — Remove `tako_answer`
- `lib/tako/tools.ts`: `buildTakoTools` returns only `tako_search` + `tako_contents`.
  `Findings` drops `answers`; `collectFindings` drops the `out.answer` branch.
- `lib/agents/reporter.ts`: `findingsContext` and `synthesize.ts`'s `synthInput`
  stop emitting `answers`; reporter's empty guard becomes `cards===0 && web===0`;
  `logCall('reporter.done')` drops the `answers` count.
- `lib/tako/labels.ts`: remove the `tako_answer` case (default branch covers it).

### Part 2 — Deterministic time-aware query wrapper
- New `lib/tako/recency.ts`: pure `timeAwareQuery(query, today)` — if the query
  already has a `\b20\d{2}\b` year, return unchanged; else append the current year.
  Idempotent, no mutation.
- `lib/config.ts`: add `TIMEZONE = 'UTC'` (matches the clock's UTC dateLine).
- `lib/tako/tools.ts`: `buildTakoTools(today)` wraps `tako_search`'s `execute` to
  rewrite the query via `timeAwareQuery`, and passes `timezone` into the retrieval
  config. `tako_contents` (url, not query) is untouched. `effort`/`count` unchanged.

### Part 3 — Consolidate the chat path
- **Delete `lib/tako/answer.ts`** (dead + duplicate).
- `lib/agents/prompts.ts`: add `askDeskSystem(today)` (research-desk persona) and a
  shared `takoSearchGuidance()` block used by **both** `reporterSystem` and
  `askDeskSystem`.
- `lib/tako/sources.ts`: add the single `dedupeSources(sources, cap)`.
- `lib/tako/answerStream.ts`: stamp `today` once, pass to `buildTakoTools(today)` +
  `askDeskSystem(today)`; import `dedupeSources`; drop local `answerSystem`,
  `dedupeSources`, and the `answers` fallback.

### Part 4 — Tailor the prompt for `tako_search`
`takoSearchGuidance()` tells the model to: write specific, entity-rich queries
(subject + metric + scope, not one word); not add the year (the wrapper guarantees
it) but name the specific season/edition/period; use a past year only for
intentionally historical data; make 1–2 targeted `tako_search` calls then
`tako_contents` on the best card's `webpage_url`; prefer cards matching the live
subject.

### Mirroring
Every Tako-gathering path funnels through `buildTakoTools` — newspaper generation
and copilot research-edits via `runReporter` (`edit-section/route.ts`), and copilot
chat Q&A via `streamAnswerWithTako`. Fixing `buildTakoTools` once propagates to all.

### Out of scope
Merging the two `findingsContext`/`synthInput` serializers — different card shapes.

## Testing
- New `recency.test.ts`: leaves `"FIFA World Cup 2026"`, rewrites `"FIFA"`→`"FIFA 2026"`,
  idempotent, uses `today`'s year.
- `tools.test.ts`: `buildTakoTools(today)` → `['tako_contents','tako_search']`;
  `collectFindings` no longer carries `answers`.
- `sources.test.ts`: `dedupeSources` dedupes by name+url and caps.
- Update `reporter.test.ts` / `synthesize.test.ts` for the removed `answers` field.
