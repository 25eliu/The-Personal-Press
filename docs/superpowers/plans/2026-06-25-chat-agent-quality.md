# Chat-Agent Research Quality, Model Upgrade & Streaming — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the Copy Desk's research agent search on-topic and grounded in the existing paper, upgrade the model to `gpt-5.4-mini`, and trim + stream the section pipeline so it's faster and feels instant.

**Architecture:** Section research flows action → `streamEditSection` → `POST /api/edit-section` → `runReporter`. We (A) forward the referenced section's real text as grounding context and make prompts topic-primary, (B) swap one `MODEL` constant, (C) drop the separate `synthesize` LLM call and stream the distillation's prose into the chat via `streamObject`.

**Tech Stack:** Next.js 16 (App Router), React 19, TypeScript, Vercel AI SDK v7 (`ai`, `@ai-sdk/openai`), `@takoviz/ai-sdk`, Zod v4, Vitest, CopilotKit.

## Global Constraints

- Model id is `gpt-5.4-mini`, set ONLY in `lib/config.ts` (`MODEL`). Verified working with `generateText`+tools, `generateObject`, and `streamObject` via `openai(MODEL)` — no Responses-API or temperature changes needed.
- URL fields stay plain `z.string()` (never `.url()`); validity enforced at runtime by `sanitizePage`/`validUrl`. Do not change schemas.
- Keep `providerOptions: { openai: { strictJsonSchema: false } }` on every `generateObject`/`streamObject`.
- Initial paper generation (`orchestrate` → `/api/generate`) must stay behavior-identical except for the (faster) model and the dropped synthesize call. Token streaming is ONLY for the chat-edit path.
- TDD: write the failing test first. Commit after each green task. Run `npx tsc --noEmit` before each commit.

---

## Task 1: Model upgrade to gpt-5.4-mini

**Files:**
- Modify: `lib/config.ts:1`

**Interfaces:**
- Produces: `MODEL = 'gpt-5.4-mini'` consumed by reporter, editor, synthesize (until removed), answer/answerStream.

- [ ] **Step 1: Change the constant**

```ts
// lib/config.ts (line 1)
export const MODEL = 'gpt-5.4-mini';
```

- [ ] **Step 2: Typecheck + build**

Run: `npx tsc --noEmit && npm run build`
Expected: both succeed (no API/type changes; the id is just a string).

- [ ] **Step 3: Commit**

```bash
git add lib/config.ts
git commit -m "feat: upgrade model to gpt-5.4-mini"
```

---

## Task 2: Topic-primary prompts + grounding block

Make the assigned topic beat recency, and add a reusable grounding block so research/writing can build on existing coverage.

**Files:**
- Modify: `lib/time/clock.ts` (`recencyInstruction`)
- Modify: `lib/agents/prompts.ts` (`reporterSystem`, add `groundingBlock`)
- Test: `lib/agents/prompts.test.ts` (create)

**Interfaces:**
- Produces: `groundingBlock(context?: string): string` — empty string when no context, else an "EXISTING COVERAGE" block.
- Produces: `reporterSystem(masthead: string, today: TodayContext): string` (unchanged signature, new wording).
- Produces: `recencyInstruction(today: TodayContext): string` (unchanged signature, topic-safe wording).

- [ ] **Step 1: Write failing tests**

```ts
// lib/agents/prompts.test.ts
import { expect, test } from 'vitest';
import { reporterSystem, groundingBlock } from '@/lib/agents/prompts';
import { recencyInstruction, todayContext } from '@/lib/time/clock';

const today = todayContext(new Date('2026-06-25T00:00:00Z'));

test('recencyInstruction no longer tells the model to reframe every query as latest/today', () => {
  const s = recencyInstruction(today).toLowerCase();
  expect(s).not.toContain('frame every');           // the old topic-hijacking directive
  expect(s).toContain('2026');                        // still date-aware
});

test('reporterSystem anchors the model to the assigned topic', () => {
  const s = reporterSystem('The Personal Press', today).toLowerCase();
  expect(s).toContain('assigned topic');
  expect(s).toMatch(/stay (strictly )?on/);
});

test('groundingBlock is empty without context and includes the text with it', () => {
  expect(groundingBlock()).toBe('');
  expect(groundingBlock('Existing transfers article text')).toContain('EXISTING COVERAGE');
  expect(groundingBlock('Existing transfers article text')).toContain('Existing transfers article text');
});
```

- [ ] **Step 2: Run tests — verify they fail**

Run: `npm run test -- prompts`
Expected: FAIL (`groundingBlock` not exported; assertions unmet).

- [ ] **Step 3: Rewrite `recencyInstruction`**

```ts
// lib/time/clock.ts — replace the recencyInstruction body
export function recencyInstruction(today: TodayContext): string {
  return `Today is ${today.dateLine} (${today.iso}). When a value can change over time, ` +
    `prefer the most recent sources (within the last ${today.windowDays} days where possible) ` +
    `and include the current year in searches so results are current. Never present old data ` +
    `as if it were today's.`;
}
```

- [ ] **Step 4: Topic-anchor `reporterSystem` + add `groundingBlock`**

```ts
// lib/agents/prompts.ts
export function groundingBlock(context?: string): string {
  if (!context || !context.trim()) return '';
  return `\n\nThis section must build on / go DEEPER than the reader's EXISTING coverage below. ` +
    `Research and write specifically about THAT subject; do not drift to an adjacent or more ` +
    `"current" story.\n\nEXISTING COVERAGE:\n${context.trim()}`;
}

export function reporterSystem(masthead: string, today: TodayContext): string {
  return `You are a reporter for "${masthead}", filing one newspaper page on a SINGLE ASSIGNED TOPIC.

Your assigned topic is fixed. Stay strictly on it. Search Tako for the latest data ABOUT THIS
TOPIC — include the current year for freshness — but NEVER substitute a different, more "current"
story for the assigned one (e.g. if the topic is a league's transfer window, do not report a
tournament happening at the same time).

${recencyInstruction(today)}

Use the Tako tools to gather REAL, sourced data:
- Prefer tako_search / tako_answer for any concrete data point (values, time series, prices,
  scores, polls, forecasts). Use web results for narrative and context. Draw on BOTH Tako and
  the web while researching, always within the assigned topic.
- When a section benefits from raw numbers, call tako_contents with a card's webpage_url to pull
  its data, then a table can be built from it.
- NEVER invent facts. Everything you report must trace to a returned card, answer, or web result.

Be efficient: a few targeted tool calls are enough. After researching, stop; a separate step will
typeset your findings into articles. Respect length: lead <= ${WORD_CAPS.lead} words,
standard <= ${WORD_CAPS.standard}, brief <= ${WORD_CAPS.brief}.`;
}
```

(Keep the existing `WORD_CAPS` import in `prompts.ts`.)

- [ ] **Step 5: Run tests — verify pass**

Run: `npm run test -- prompts`
Expected: PASS (3 tests).

- [ ] **Step 6: Typecheck + commit**

```bash
npx tsc --noEmit
git add lib/time/clock.ts lib/agents/prompts.ts lib/agents/prompts.test.ts
git commit -m "feat: topic-primary reporter prompts + grounding block"
```

---

## Task 3: runReporter options arg, grounding context, drop synthesize

Switch `runReporter` to an options object, thread `context` into the distill prompt, and remove the separate `synthesizeBundles` call (fold its number↔narrative pairing + freshness intent into the distill prompt).

**Files:**
- Modify: `lib/agents/reporter.ts` (`runReporter` signature, `distillPrompt`, remove synthesize call)
- Modify: `lib/agents/orchestrate.ts:42-45` (call site)
- Modify: `app/api/edit-section/route.ts:47-54` (call site)
- Test: `lib/agents/reporter.test.ts` (extend — add distillPrompt grounding test)

**Interfaces:**
- Produces: `type ReporterOpts = { context?: string; onActivity?: (a: ReporterActivity) => void; onDraftToken?: (t: string) => void; signal?: AbortSignal }`
- Produces: `runReporter(topic: string, isFront: boolean, masthead: string, today: TodayContext, opts?: ReporterOpts): Promise<TPage>`
- Produces (exported for test): `distillPrompt(topic, isFront, ctx, today, context?)` — now takes optional grounding `context` and always uses the raw-findings shape (no `paired` flag).
- Consumes: `groundingBlock` from Task 2.

- [ ] **Step 1: Write failing test for distillPrompt grounding**

```ts
// lib/agents/reporter.test.ts — add
import { distillPrompt } from '@/lib/agents/reporter';
import { todayContext } from '@/lib/time/clock';

test('distillPrompt embeds grounding context when provided', () => {
  const today = todayContext(new Date('2026-06-25T00:00:00Z'));
  const withCtx = distillPrompt('Premier League transfers', false, '{}', today, 'Prior transfers article');
  expect(withCtx).toContain('EXISTING COVERAGE');
  expect(withCtx).toContain('Prior transfers article');
  const noCtx = distillPrompt('Premier League transfers', false, '{}', today);
  expect(noCtx).not.toContain('EXISTING COVERAGE');
});
```

- [ ] **Step 2: Run — verify fail**

Run: `npm run test -- reporter`
Expected: FAIL (`distillPrompt` not exported / signature mismatch).

- [ ] **Step 3: Rewrite `distillPrompt` (export it; raw-findings + pairing + grounding)**

```ts
// lib/agents/reporter.ts
import { groundingBlock, reporterSystem } from '@/lib/agents/prompts';

export function distillPrompt(
  topic: string,
  isFront: boolean,
  ctx: string,
  today: TodayContext,
  context?: string,
): string {
  const layout = isFront
    ? 'This is the FRONT PAGE: produce exactly one "lead" article plus 2 or 3 "brief" articles.'
    : 'This is a TOPIC PAGE: produce 2 to 4 articles sized "standard" or "brief" (at most one "lead").';
  return `Today is ${today.dateLine}. Topic: "${topic}"
${layout}${groundingBlock(context)}

Write the page strictly from the research below. Pair Tako's hard numbers with the web's narrative
about the SAME story, leading each article with the number/finding. Prefer the most recent sources;
if you must use older data, work an "as of <date>" into the kicker or dek. Every article MUST include
at least one source drawn from this research. Do not invent facts, sources, or dates. Respect word
caps (lead <= ${WORD_CAPS.lead}, standard <= ${WORD_CAPS.standard}, brief <= ${WORD_CAPS.brief}).
If the research is thin, write fewer, shorter articles rather than padding.

RESEARCH (JSON):
${ctx}`;
}
```

- [ ] **Step 4: Replace `runReporter` body — options arg, drop synthesize, raw distill**

```ts
// lib/agents/reporter.ts
export type ReporterOpts = {
  context?: string;
  onActivity?: (a: ReporterActivity) => void;
  onDraftToken?: (t: string) => void;   // used in Task 4; accept now, ignore here
  signal?: AbortSignal;
};

export async function runReporter(
  topic: string,
  isFront: boolean,
  masthead: string,
  today: TodayContext,
  opts: ReporterOpts = {},
): Promise<TPage> {
  const { context, onActivity, signal } = opts;
  try {
    const tools = buildTakoTools();
    logCall('reporter.start', { slot: isFront ? 0 : undefined, topic, model: MODEL });

    const { steps, usage } = await generateText({
      model: openai(MODEL),
      system: reporterSystem(masthead, today),
      prompt: `Report the section: "${topic}" as of ${today.dateLine}. Stay strictly on this topic; ` +
        `gather the LATEST sourced data about it with the Tako tools.`,
      tools,
      stopWhen: isStepCount(6),
      abortSignal: signal,
      onStepFinish: (step) => {
        for (const call of step.toolCalls ?? []) {
          const tool = call.toolName;
          const detail = toolDetail((call as { input?: unknown }).input);
          logCall('tool.call', { topic, tool, detail: clip(detail) });
          onActivity?.({ tool, label: toolLabel(tool), detail });
        }
      },
    });

    const findings = collectFindings(steps);
    logCall('reporter.done', {
      topic, cards: findings.cards.length, web: findings.web.length,
      answers: findings.answers.length, usage: usageSummary(usage),
    });
    if (findings.cards.length === 0 && findings.web.length === 0 && findings.answers.length === 0) {
      return emptyPage(topic);
    }

    const research = findingsContext(findings);
    logCall('distill.start', { topic, model: MODEL });
    const { object, usage: distillUsage } = await generateObject({
      model: openai(MODEL),
      schema: Page,
      prompt: distillPrompt(topic, isFront, research, today, context),
      providerOptions: { openai: { strictJsonSchema: false } },
      maxRetries: 3,
      abortSignal: signal,
    });
    logCall('distill.done', { topic, articles: object.articles.length, usage: usageSummary(distillUsage) });
    return attachArt(sanitizePage({ ...object, topic }), findings);
  } catch (err) {
    logCall('error', { scope: 'reporter', topic, message: err instanceof Error ? err.message : String(err) });
    return emptyPage(topic);
  }
}
```

Remove the now-unused imports of `synthesizeBundles`, `bundlesContext`, `StoryBundle` from `reporter.ts`. Leave `lib/agents/synthesize.ts` in place (its pure helpers stay unit-tested; only the call is removed).

- [ ] **Step 5: Update `orchestrate.ts` call site**

```ts
// lib/agents/orchestrate.ts:42-45
const page = await runReporter(topic, slot === 0, plan.masthead, today, {
  onActivity: (a) => emit({ type: 'tool_activity', slot, topic, tool: a.tool, label: a.label, detail: a.detail }),
  signal,
});
```

- [ ] **Step 6: Update `edit-section/route.ts` call site (context passthrough)**

```ts
// app/api/edit-section/route.ts — parse context, pass options
// in POST: read body.context
const context = typeof body?.context === 'string' ? body.context : undefined;
// ...
const page = await runReporter(topic, isFront, BRAND, todayContext(), {
  context,
  onActivity: (a) => safeEnqueue({ type: 'tool_activity', slot: 0, topic, tool: a.tool, label: a.label, detail: a.detail }),
  signal,
});
```

- [ ] **Step 7: Run tests + typecheck**

Run: `npm run test && npx tsc --noEmit`
Expected: PASS (existing reporter/orchestrate tests green; new grounding test green).

- [ ] **Step 8: Commit**

```bash
git add lib/agents/reporter.ts lib/agents/orchestrate.ts app/api/edit-section/route.ts lib/agents/reporter.test.ts
git commit -m "feat: runReporter options + grounding context, drop synthesize call"
```

---

## Task 4: Streaming distillation (streamObject) + token events

When `onDraftToken` is provided, distill with `streamObject` and stream the forming prose to the chat. Add a `token` event to the section stream.

**Files:**
- Modify: `lib/stream/events.ts` (add `token` event)
- Create: `lib/agents/draft.ts` (pure `draftFromPartial`)
- Test: `lib/agents/draft.test.ts` (create)
- Modify: `lib/agents/reporter.ts` (`streamObject` branch when `onDraftToken` set)
- Modify: `app/api/edit-section/route.ts` (wire `onDraftToken` → `token` event)

**Interfaces:**
- Produces: `GenerateEvent` gains `| { type: 'token'; slot: number; text: string }`.
- Produces: `draftFromPartial(partial: { articles?: Array<{ headline?: string; body?: string } | undefined> } | undefined): string` — ordered, stable prose ("HEADLINE\n\nbody") for completed-enough fields.
- Consumes: `streamObject` from `ai`.

- [ ] **Step 1: Write failing test for `draftFromPartial`**

```ts
// lib/agents/draft.test.ts
import { expect, test } from 'vitest';
import { draftFromPartial } from '@/lib/agents/draft';

test('draftFromPartial joins headline + body per article in order', () => {
  expect(draftFromPartial(undefined)).toBe('');
  expect(draftFromPartial({ articles: [{ headline: 'Mortgage Rates Hold' }] })).toBe('Mortgage Rates Hold');
  expect(draftFromPartial({ articles: [
    { headline: 'A', body: 'alpha' },
    { headline: 'B', body: 'beta' },
  ] })).toBe('A\n\nalpha\n\nB\n\nbeta');
});

test('draftFromPartial output only grows as fields fill (prefix-stable)', () => {
  const a = draftFromPartial({ articles: [{ headline: 'Head' }] });
  const b = draftFromPartial({ articles: [{ headline: 'Head', body: 'body text' }] });
  expect(b.startsWith(a)).toBe(true);
});
```

- [ ] **Step 2: Run — verify fail**

Run: `npm run test -- draft`
Expected: FAIL (module missing).

- [ ] **Step 3: Implement `draftFromPartial`**

```ts
// lib/agents/draft.ts
type PartialArticle = { headline?: string; body?: string } | undefined;
type PartialPage = { articles?: PartialArticle[] } | undefined;

/** Build a stable, prefix-only-growing prose preview from a streaming partial Page. */
export function draftFromPartial(partial: PartialPage): string {
  const out: string[] = [];
  for (const a of partial?.articles ?? []) {
    if (!a) break;                       // stop at first absent article (order matters)
    if (a.headline) out.push(a.headline);
    if (a.body) out.push(a.body);
  }
  return out.join('\n\n');
}
```

- [ ] **Step 4: Run — verify pass**

Run: `npm run test -- draft`
Expected: PASS.

- [ ] **Step 5: Add `token` to the event union**

```ts
// lib/stream/events.ts — add to GenerateEvent union
  | { type: 'token'; slot: number; text: string }
```

- [ ] **Step 6: Add the streaming branch to `runReporter`**

Replace the distill block in `runReporter` so that when `opts.onDraftToken` is set it streams:

```ts
// lib/agents/reporter.ts — inside runReporter, after `const research = ...`
import { streamObject } from 'ai';            // add to imports
import { draftFromPartial } from '@/lib/agents/draft';

logCall('distill.start', { topic, model: MODEL, stream: Boolean(opts.onDraftToken) });
let object: TPage;
if (opts.onDraftToken) {
  const result = streamObject({
    model: openai(MODEL),
    schema: Page,
    prompt: distillPrompt(topic, isFront, research, today, context),
    providerOptions: { openai: { strictJsonSchema: false } },
    abortSignal: signal,
  });
  let lastDraft = '';
  for await (const partial of result.partialObjectStream) {
    if (signal?.aborted) break;
    const full = draftFromPartial(partial as { articles?: Array<{ headline?: string; body?: string }> });
    if (full.length > lastDraft.length && full.startsWith(lastDraft)) {
      opts.onDraftToken(full.slice(lastDraft.length));
      lastDraft = full;
    }
  }
  object = await result.object;            // validated against Page
} else {
  const r = await generateObject({
    model: openai(MODEL),
    schema: Page,
    prompt: distillPrompt(topic, isFront, research, today, context),
    providerOptions: { openai: { strictJsonSchema: false } },
    maxRetries: 3,
    abortSignal: signal,
  });
  object = r.object;
}
logCall('distill.done', { topic, articles: object.articles.length });
return attachArt(sanitizePage({ ...object, topic }), findings);
```

(Remove the old single `generateObject` distill block this replaces.)

- [ ] **Step 7: Wire `onDraftToken` → `token` event in the route**

```ts
// app/api/edit-section/route.ts — add to the runReporter opts
const page = await runReporter(topic, isFront, BRAND, todayContext(), {
  context,
  onActivity: (a) => safeEnqueue({ type: 'tool_activity', slot: 0, topic, tool: a.tool, label: a.label, detail: a.detail }),
  onDraftToken: (t) => safeEnqueue({ type: 'token', slot: 0, text: t }),
  signal,
});
```

- [ ] **Step 8: Typecheck, test, build**

Run: `npx tsc --noEmit && npm run test && npm run build`
Expected: all pass. (`streamEditSection`/`onEvent` already accept `GenerateEvent`, so the new `token` type flows without changes; `DailyTako.onEvent` ignores `token` harmlessly.)

- [ ] **Step 9: Commit**

```bash
git add lib/stream/events.ts lib/agents/draft.ts lib/agents/draft.test.ts lib/agents/reporter.ts app/api/edit-section/route.ts
git commit -m "feat: stream section distillation tokens into the edit stream"
```

---

## Task 5: Grounding + draft streaming in the chat actions

Add `groundingSlot` to the research actions, serialize the referenced section from state, pass `context`, and surface the streamed draft prose.

**Files:**
- Create: `lib/edition/grounding.ts` (pure `sectionToContext`)
- Test: `lib/edition/grounding.test.ts` (create)
- Modify: `lib/edition/useEditionCopilot.ts` (`runResearch` + `addSection`/`replaceWithResearch` params; token→`researchAnswer`)
- Modify: `lib/stream/editClient.ts` (accept `context` in body)
- Modify: `lib/edition/instructions.ts` (teach `groundingSlot` + on-topic)

**Interfaces:**
- Produces: `sectionToContext(page: TPage): string` — "Topic: …" + each article "HEADLINE — body" lines.
- Consumes: `streamEditSection({ topic, isFront, context })`, `GenerateEvent` `token`.

- [ ] **Step 1: Write failing test for `sectionToContext`**

```ts
// lib/edition/grounding.test.ts
import { expect, test } from 'vitest';
import { sectionToContext } from '@/lib/edition/grounding';

test('sectionToContext serializes topic + article headlines/bodies', () => {
  const ctx = sectionToContext({
    topic: 'Football',
    articles: [
      { kicker: 'Transfers', headline: 'Summer Window Opens', byline: 'Wire', body: 'Clubs spend big.', size: 'standard', sources: [{ name: 'BBC' }] },
    ],
  });
  expect(ctx).toContain('Football');
  expect(ctx).toContain('Summer Window Opens');
  expect(ctx).toContain('Clubs spend big.');
});
```

- [ ] **Step 2: Run — verify fail**

Run: `npm run test -- grounding`
Expected: FAIL (module missing).

- [ ] **Step 3: Implement `sectionToContext`**

```ts
// lib/edition/grounding.ts
import type { TPage } from '@/lib/schema';

/** Serialize an existing section into grounding context for re-research. */
export function sectionToContext(page: TPage): string {
  const lines = page.articles.map(
    (a) => `- ${a.headline}${a.dek ? ` — ${a.dek}` : ''}\n  ${a.body}`,
  );
  return `Section topic: "${page.topic}"\nExisting articles:\n${lines.join('\n')}`;
}
```

- [ ] **Step 4: Run — verify pass**

Run: `npm run test -- grounding`
Expected: PASS.

- [ ] **Step 5: Extend `streamEditSection` body type**

```ts
// lib/stream/editClient.ts — widen the body param
export async function streamEditSection(
  body: { topic: string; isFront?: boolean; context?: string },
  onEvent: (e: GenerateEvent) => void,
  signal?: AbortSignal,
): Promise<TPage | null> {
```

(The fetch already JSON-stringifies `body`, so `context` is forwarded automatically.)

- [ ] **Step 6: Thread context + draft tokens through `runResearch`**

```ts
// lib/edition/useEditionCopilot.ts — replace runResearch
const runResearch = async (topic: string, isFront: boolean, context?: string) => {
  resetResearch();
  return streamEditSection(
    { topic, isFront, context },
    (e) => {
      if (e.type === 'tool_activity') {
        setResearchLines((prev) => [...prev, e.detail ? `${e.label} — “${e.detail}”` : e.label]);
      } else if (e.type === 'token') {
        setResearchAnswer((prev) => prev + e.text);    // streams the forming section into the chat bubble
      } else if (e.type === 'error') {
        setResearchDone(`⚠ ${e.message}`);
      }
    },
    editSignal(),
  );
};
```

- [ ] **Step 7: Add `groundingSlot` to `addSection` and `replaceWithResearch`**

For `addSection`, add a parameter and build context:

```ts
// addSection parameters: add
{ name: 'groundingSlot', type: 'number', description: 'If the request refers to or builds on an existing section, its slot — so the research is grounded in that coverage.', required: false },
// addSection handler: build context, pass it
import { sectionToContext } from '@/lib/edition/grounding';   // add import
handler: async ({ topic, position, groundingSlot }) => {
  const src = typeof groundingSlot === 'number' ? stateRef.current.pages[groundingSlot] : undefined;
  const context = src ? sectionToContext(src) : undefined;
  const page = await runResearch(topic, false, context);
  if (!page) return `No fresh reporting found for “${topic}”.`;
  const v = validatePage(page);
  if (!v.ok) return v.error;
  if (!hasRealContent(v.page)) return `No fresh reporting found for “${topic}”.`;
  dispatch({ type: 'ADD_SECTION', page: v.page, position });
  setResearchDone(`Added “${v.page.topic}”.`);
  return `Added a new section: “${v.page.topic}”.`;
},
```

For `replaceWithResearch`, ground in the section being replaced:

```ts
handler: async ({ slot, topic }) => {
  const page = stateRef.current.pages[slot];
  if (!page) return `No section at slot ${slot}.`;
  const fresh = await runResearch(topic, slot === 0, sectionToContext(page));
  if (!fresh) return `No fresh reporting found for “${topic}”.`;
  const v = validatePage(fresh);
  if (!v.ok) return v.error;
  if (!hasRealContent(v.page)) return `No fresh reporting found for “${topic}”.`;
  dispatch({ type: 'REPLACE_PAGE', slot, page: v.page });
  setResearchDone(`Replaced “${page.topic}” → “${v.page.topic}”.`);
  return `Replaced the “${page.topic}” section with freshly-researched reporting: “${v.page.topic}”.`;
},
```

(`refreshChart` already passes the page topic; optionally add `sectionToContext(page)` as its third `runResearch` arg the same way.)

- [ ] **Step 8: Teach the copilot in `instructions.ts`**

Add under "CHOOSING THE RIGHT ACTION":

```
- When a research command REFERS TO or builds on existing content (e.g. "explain the summer-transfers
  thing in more depth", "expand the section about X"), pass groundingSlot = the slot of that existing
  section so the research stays on that exact subject and goes deeper instead of drifting. Craft a precise
  topic that names the subject explicitly (include the league/place/year), never a vague one.
```

- [ ] **Step 9: Typecheck, test, lint, build**

Run: `npx tsc --noEmit && npm run test && npx eslint lib/edition lib/agents lib/stream app/api/edit-section && npm run build`
Expected: all pass.

- [ ] **Step 10: Commit**

```bash
git add lib/edition/grounding.ts lib/edition/grounding.test.ts lib/edition/useEditionCopilot.ts lib/stream/editClient.ts lib/edition/instructions.ts
git commit -m "feat: ground research in referenced sections + stream section draft into chat"
```

---

## Task 6: End-to-end verification

**Files:** none (verification only).

- [ ] **Step 1: Start dev server**

Run: `npm run dev` (note the port; 3000 or next free).

- [ ] **Step 2: On-topic + grounding (the reported bug)**

Use the `/browse` skill: load the app → "Preview a sample edition" → open Copy Desk → send:
"add a section that explains the summer-league transfers thing in more depth, underneath the football section".
Expected (assert in the server log): `model: gpt-5.4-mini`; `tool.call` queries are about **Premier League / summer transfers**, NOT the World Cup; a new section appears under Football and reads as a deeper take. No `synthesize.start` log line.

- [ ] **Step 3: Streaming + latency**

Watch the chat bubble: section prose streams in token-by-token (via `ResearchProgress` answer) before it lands on the page. Confirm the request→section wall-clock is below the prior ~15s.

- [ ] **Step 4: Regressions**

"what's the latest US GDP?" → `askTako` still streams an answer (paper unchanged). "make the lead punchier" → `editArticle` still applies. "change the Football section to cover the US economy" → `replaceWithResearch` replaces the whole section.

- [ ] **Step 5: Full gates**

Run: `npm run test && npx tsc --noEmit && npm run build`
Expected: all green.

- [ ] **Step 6: Final commit (if any verification fixups were needed)**

```bash
git add -A && git commit -m "test: verify chat-agent quality, model, and streaming end-to-end"
```

---

## Self-Review (completed by plan author)

- **Spec coverage:** A1 grounding context → Task 3/5; A2 runReporter injection → Task 3; A3 topic-primary prompts → Task 2; B model → Task 1 (+ probe-verified); C1 drop synthesize → Task 3; C2 stream draft → Task 4/5. All covered.
- **Type consistency:** `ReporterOpts`, `runReporter(…, opts)`, `distillPrompt(topic,isFront,ctx,today,context?)`, `draftFromPartial`, `sectionToContext`, `GenerateEvent.token{slot,text}` are defined once and consumed with matching names/signatures across tasks.
- **No placeholders:** every code/test step shows real content and exact commands.
