# Click-to-See-Full Graphic Modal — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a small "⊕ Full" trigger to every data graphic on the newspaper that opens a modal overlay — dimming the whole paper behind it — showing the full-size graphic and/or the complete uncapped data table, closable back to the paper.

**Architecture:** Pure helpers (`modalShowsGraphic`, `capRows`, modal chart sizes) live in `lib/newspaper/graphicModal.ts` and are unit-tested. A client component `GraphicModal.tsx` provides `ExpandableGraphic` (the trigger wrapper) and `GraphicModal` (the portal overlay). `GraphicView` gains an `expandable` flag that wraps its output in `ExpandableGraphic`; only `BlockView` (the printed leaves) opts in. `DataTable` gains a `maxRows` prop so the modal can render every row.

**Tech Stack:** Next 16 / React 19, TypeScript, recharts, Tailwind, vitest (node env).

## Global Constraints

- **Tests:** vitest, node environment, `include: ['lib/**/*.test.ts']` only. Unit-test pure
  logic in `lib/`. The repo has **no** component/DOM tests — do **not** add jsdom or
  testing-library. Verify React components with `npx tsc --noEmit` + `npm run build` + `/browse`.
- **Measurement invariant:** the printed paper paginates via a hidden measuring pass that renders
  the same `BlockView`. The new trigger MUST be absolutely positioned (zero layout height) and the
  modal MUST be closed by default / portaled out, so measured page heights are **unchanged**.
- **Immutability:** no mutation of inputs; helpers return new arrays/objects.
- **Styling idiom:** newsprint — `font-mono-news`, ink-on-`var(--paper,#f4efe4)`, hairline
  `border-black/70`, tiny uppercase type. Reuse the `paper` surface class for the modal panel.
- Commit type prefixes: `feat`/`fix`/`refactor`/`test`/`docs`.

---

### Task 1: Pure modal helpers (`lib/newspaper/graphicModal.ts`)

**Files:**
- Create: `lib/newspaper/graphicModal.ts`
- Test: `lib/newspaper/graphicModal.test.ts`

**Interfaces:**
- Consumes: `TGraphic` from `@/lib/schema` (kinds: `chart`, `scatter`, `composition`, `standings`, `stat`, `schedule`).
- Produces:
  - `modalShowsGraphic(kind: TGraphic['kind']): boolean`
  - `capRows<T>(rows: readonly T[], maxRows: number): { shown: T[]; extra: number }`
  - `MODAL_CHART_W: number` (`680`), `MODAL_CHART_H: number` (`380`)

- [ ] **Step 1: Write the failing test**

Create `lib/newspaper/graphicModal.test.ts`:

```ts
import { expect, test } from 'vitest';
import { capRows, modalShowsGraphic, MODAL_CHART_W, MODAL_CHART_H } from '@/lib/newspaper/graphicModal';

test('capRows caps to maxRows and reports the hidden remainder', () => {
  expect(capRows([1, 2, 3, 4, 5], 3)).toEqual({ shown: [1, 2, 3], extra: 2 });
});

test('capRows with Infinity shows every row and hides none', () => {
  expect(capRows([1, 2, 3, 4, 5], Infinity)).toEqual({ shown: [1, 2, 3, 4, 5], extra: 0 });
});

test('capRows never reports negative extra when there are fewer rows than the cap', () => {
  expect(capRows([1, 2], 8)).toEqual({ shown: [1, 2], extra: 0 });
});

test('capRows does not mutate its input', () => {
  const rows = [1, 2, 3];
  capRows(rows, 1);
  expect(rows).toEqual([1, 2, 3]);
});

test('modalShowsGraphic is true for visual graph kinds', () => {
  for (const k of ['chart', 'scatter', 'composition'] as const) {
    expect(modalShowsGraphic(k)).toBe(true);
  }
});

test('modalShowsGraphic is false for already-tabular kinds', () => {
  for (const k of ['standings', 'schedule', 'stat'] as const) {
    expect(modalShowsGraphic(k)).toBe(false);
  }
});

test('modal chart size is larger than the column-fit chart', () => {
  expect(MODAL_CHART_W).toBeGreaterThan(260);
  expect(MODAL_CHART_H).toBeGreaterThan(168);
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run lib/newspaper/graphicModal.test.ts`
Expected: FAIL — `Cannot find module '@/lib/newspaper/graphicModal'`.

- [ ] **Step 3: Write the minimal implementation**

Create `lib/newspaper/graphicModal.ts`:

```ts
import type { TGraphic } from '@/lib/schema';

/**
 * Kinds that draw a visual graph: the modal renders a LARGE version of the graphic above the
 * complete data table. Every other kind is already tabular, so the modal shows the full table
 * alone (no redundant second table).
 */
const VISUAL_KINDS: ReadonlySet<TGraphic['kind']> = new Set(['chart', 'scatter', 'composition']);

export function modalShowsGraphic(kind: TGraphic['kind']): boolean {
  return VISUAL_KINDS.has(kind);
}

/** Larger chart dimensions for the in-modal render (printed paper uses CHART_W/CHART_H). */
export const MODAL_CHART_W = 680;
export const MODAL_CHART_H = 380;

/**
 * Shared row cap. The printed DataTable passes its small default; the modal passes `Infinity`
 * to show every row. Returns the visible rows plus how many were hidden. Never mutates `rows`.
 */
export function capRows<T>(rows: readonly T[], maxRows: number): { shown: T[]; extra: number } {
  const shown = rows.slice(0, maxRows);
  return { shown, extra: rows.length - shown.length };
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run lib/newspaper/graphicModal.test.ts`
Expected: PASS — all 7 tests green.

- [ ] **Step 5: Commit**

```bash
git add lib/newspaper/graphicModal.ts lib/newspaper/graphicModal.test.ts
git commit -m "feat: pure helpers for the graphic-expand modal"
```

---

### Task 2: `DataTable` gains a `maxRows` prop

**Files:**
- Modify: `components/newspaper/DataTable.tsx`

**Interfaces:**
- Consumes: `capRows` from `@/lib/newspaper/graphicModal` (Task 1).
- Produces: `DataTable({ table, maxRows }: { table: TTableData; maxRows?: number })` — `maxRows`
  defaults to `8` (unchanged printed behavior); the modal will pass `Infinity`.

> No new unit test: the row-capping logic IS `capRows`, already tested in Task 1. This task only
> rewires `DataTable` to consume it. Verify with the type-check + build in Step 3.

- [ ] **Step 1: Edit `DataTable.tsx`**

Replace the top imports + the `MAX_ROWS` constant + the function signature/first two body lines.

Change the import block (currently lines 1-3) to add the helper:

```ts
import type { TTableData } from '@/lib/schema';
import { colValues, detectColumnUnit, isNumericColumn, looksLikeDates } from '@/lib/newspaper/tableShape';
import { formatCell, formatLabel, shortLabel } from '@/lib/newspaper/format';
import { capRows } from '@/lib/newspaper/graphicModal';
```

Keep the `MAX_ROWS` constant as the default. Change the function header (currently lines 9-12):

```ts
const MAX_ROWS = 8;

export function DataTable({ table, maxRows = MAX_ROWS }: { table: TTableData; maxRows?: number }) {
  const { shown: rows, extra } = capRows(table.rows, maxRows);
```

Delete the now-removed original two lines:

```ts
  const rows = table.rows.slice(0, MAX_ROWS);
  const extra = table.rows.length - rows.length;
```

Everything below (the `col` mapping, `fmt`, JSX, and `{extra > 0 && ...}`) stays exactly as-is.

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors related to `DataTable` / `graphicModal`.

- [ ] **Step 3: Commit**

```bash
git add components/newspaper/DataTable.tsx
git commit -m "feat: DataTable maxRows prop (uncapped rows for the modal)"
```

---

### Task 3: `GraphicModal.tsx` — trigger wrapper + portal overlay

**Files:**
- Create: `components/newspaper/GraphicModal.tsx`

**Interfaces:**
- Consumes: `GraphicView` (`./GraphicView`), `DataTable` (`./DataTable`),
  `modalShowsGraphic`/`MODAL_CHART_W`/`MODAL_CHART_H` (`@/lib/newspaper/graphicModal`),
  `TGraphic`/`TTableData` (`@/lib/schema`).
- Produces:
  - `ExpandableGraphic({ graphic, table, caption, children }: { graphic: TGraphic; table: TTableData; caption: string; children: React.ReactNode })` — wraps a printed graphic with the trigger + modal state.
  - `GraphicModal({ graphic, table, caption, onClose }: { graphic: TGraphic; table: TTableData; caption: string; onClose: () => void })` — the portal overlay.

> Note: `GraphicModal` re-renders `GraphicView`, which (Task 4) imports `ExpandableGraphic` from
> this file — a benign import cycle. Neither side references the other at module top level (only
> inside component render), so it resolves fine. The in-modal `GraphicView` is rendered WITHOUT
> `expandable`, so there is no nested trigger.

- [ ] **Step 1: Create `components/newspaper/GraphicModal.tsx`**

```tsx
'use client';
import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import type { TGraphic, TTableData } from '@/lib/schema';
import { GraphicView } from './GraphicView';
import { DataTable } from './DataTable';
import { MODAL_CHART_H, MODAL_CHART_W, modalShowsGraphic } from '@/lib/newspaper/graphicModal';

/**
 * Wraps a printed graphic with a small "⊕ Full" trigger pinned to the top-right corner. The
 * trigger is ABSOLUTELY positioned, so it adds no layout height — the paginator measures the
 * same height it always did. Clicking it opens GraphicModal over the newspaper.
 */
export function ExpandableGraphic({
  graphic,
  table,
  caption,
  children,
}: {
  graphic: TGraphic;
  table: TTableData;
  caption: string;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className="relative">
      {children}
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="See the full graphic and data"
        className="font-mono-news absolute right-1 top-1 z-10 border border-black/70 bg-[var(--paper,#f4efe4)] px-1 text-[9px] font-bold uppercase tracking-wide text-black/80 hover:bg-black hover:text-[var(--paper,#f4efe4)]"
      >
        ⊕ Full
      </button>
      {open && (
        <GraphicModal graphic={graphic} table={table} caption={caption} onClose={() => setOpen(false)} />
      )}
    </div>
  );
}

/**
 * The overlay: a dimmed backdrop that shadows the whole newspaper, with the graphic rendered on
 * top. Visual kinds (chart/scatter/composition) show a LARGE graphic above the complete table;
 * already-tabular kinds show the full uncapped table alone. Closes on Esc, backdrop click, or ✕.
 */
export function GraphicModal({
  graphic,
  table,
  caption,
  onClose,
}: {
  graphic: TGraphic;
  table: TTableData;
  caption: string;
  onClose: () => void;
}) {
  // Portals need the DOM; guard the first (server/SSR) render where document.body is absent.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  // Esc closes, matching backdrop-click and the ✕ button.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  if (!mounted) return null;

  const showGraphic = modalShowsGraphic(graphic.kind);
  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      onClick={onClose}
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 p-4"
    >
      {/* stopPropagation so clicks INSIDE the panel don't close it */}
      <div
        onClick={(e) => e.stopPropagation()}
        className="paper relative max-h-[88vh] w-full max-w-[760px] overflow-auto p-5"
      >
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="font-mono-news absolute right-2 top-2 z-10 border border-black/70 px-1.5 text-xs font-bold leading-none hover:bg-black hover:text-[var(--paper,#f4efe4)]"
        >
          ✕
        </button>
        {showGraphic && (
          <div className="mb-4 flex justify-center">
            <GraphicView
              graphic={graphic}
              table={table}
              caption={caption}
              width={MODAL_CHART_W}
              height={MODAL_CHART_H}
            />
          </div>
        )}
        <DataTable table={table} maxRows={Infinity} />
      </div>
    </div>,
    document.body,
  );
}
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors. (`GraphicView`'s `expandable` prop arrives in Task 4; this file never sets
it, so the current `GraphicView` signature already accepts these props.)

- [ ] **Step 3: Commit**

```bash
git add components/newspaper/GraphicModal.tsx
git commit -m "feat: GraphicModal overlay + ExpandableGraphic trigger wrapper"
```

---

### Task 4: Wire `expandable` through `GraphicView` and turn it on in `BlockView`

**Files:**
- Modify: `components/newspaper/GraphicView.tsx`
- Modify: `components/newspaper/BlockView.tsx:161`, `components/newspaper/BlockView.tsx:194`

**Interfaces:**
- Consumes: `ExpandableGraphic` from `./GraphicModal` (Task 3).
- Produces: `GraphicView` gains `expandable?: boolean` (default `false`). When `true`, its rendered
  figure is wrapped in `ExpandableGraphic`. Existing callers (`ResearchProgress`, `RevealingPage`)
  pass nothing → unchanged.

- [ ] **Step 1: Edit `GraphicView.tsx` — add the import**

Add to the import block at the top:

```ts
import { ExpandableGraphic } from './GraphicModal';
```

- [ ] **Step 2: Edit `GraphicView.tsx` — add the prop and wrap the output**

Add `expandable` to the destructured props and its type (in the existing props object):

```ts
export function GraphicView({
  graphic,
  table,
  caption,
  width,
  height,
  animate = false,
  className,
  expandable = false,
}: {
  graphic: TGraphic;
  table: TTableData;
  caption: string;
  width?: number;
  height?: number;
  animate?: boolean;
  className?: string;
  expandable?: boolean;
}) {
```

Wrap the existing `switch` so its result can be wrapped. Rename the current `switch (graphic.kind) { ... }` body into a local `figure`, then wrap. Replace the function body (everything after the destructure) with:

```ts
  const figure = renderGraphic();
  if (!expandable || figure === null) return figure;
  return (
    <ExpandableGraphic graphic={graphic} table={table} caption={caption}>
      {figure}
    </ExpandableGraphic>
  );

  function renderGraphic() {
    switch (graphic.kind) {
      case 'chart':
        return (
          <NewsChart
            chart={{ type: graphic.type, labelColumn: graphic.labelColumn, valueColumns: graphic.valueColumns, unit: graphic.unit }}
            table={table}
            caption={caption}
            width={width}
            height={height}
            animate={animate}
            className={className}
          />
        );
      case 'scatter':
        return (
          <ScatterPlot graphic={graphic} table={table} caption={caption} width={width} height={height} animate={animate} className={className} />
        );
      case 'composition':
        return <CompositionBar graphic={graphic} table={table} caption={caption} />;
      case 'standings':
        return <StandingsTable graphic={graphic} table={table} caption={caption} />;
      case 'stat':
        return <StatCallout graphic={graphic} table={table} caption={caption} />;
      case 'schedule':
        return <ScheduleCard graphic={graphic} table={table} caption={caption} />;
      default:
        return null;
    }
  }
}
```

(The `switch` cases are copied verbatim from the original — only moved into the hoisted
`renderGraphic` function declaration so the `expandable` wrap can sit above it.)

- [ ] **Step 3: Edit `BlockView.tsx` — opt the printed graphics into `expandable`**

At line 194 (the static printed graphic), add the flag:

```tsx
  if (kind === 'graphic' && article.graphic && article.table) {
    return <GraphicView graphic={article.graphic} table={article.table} caption={article.headline} expandable />;
  }
```

At line 161 (the live-edit graphic reload), add the flag:

```tsx
      return (
        <div className="live-edit-rise">
          <GraphicView graphic={live.graphic} table={live.table} caption={live.headline} expandable />
        </div>
      );
```

Leave `ResearchProgress.tsx` and `RevealingPage.tsx` untouched (no `expandable` → no trigger in
the chat preview or the reveal animation).

- [ ] **Step 4: Type-check + build**

Run: `npx tsc --noEmit && npm run build`
Expected: clean type-check; build succeeds (Next type-checks the import cycle and the new props).

- [ ] **Step 5: Run the full unit suite (no regressions)**

Run: `npm test`
Expected: all suites PASS, including `lib/newspaper/graphicModal.test.ts` and the existing
pagination/graphic tests.

- [ ] **Step 6: Commit**

```bash
git add components/newspaper/GraphicView.tsx components/newspaper/BlockView.tsx
git commit -m "feat: click-to-see-full trigger on printed newspaper graphics"
```

---

## Manual Verification (`/browse`)

After Task 4, run the app and dogfood:

- [ ] A chart/graphic on the paper shows a small **⊕ Full** trigger in its top-right corner.
- [ ] Clicking it dims (shadows) the **entire** newspaper and renders, on top: a large chart +
      the complete data table (for chart/scatter/composition), or the full uncapped table (for
      standings/schedule/stat).
- [ ] The table inside the modal scrolls when long; the modal never exceeds the viewport.
- [ ] **Esc**, clicking the dimmed backdrop, and the **✕** button each return to the paper.
- [ ] The newspaper layout is **identical** with the trigger present — no page reflow, no graphic
      shifted, pages still paginate the same (the measurement invariant held).

---

## Self-Review

**Spec coverage:**
- "trigger on every data graphic" → Task 4 (`expandable` on `BlockView`'s printed + live graphics).
- "modal on top, shadows everything, closes back" → Task 3 (`GraphicModal` backdrop + Esc/backdrop/✕).
- "adaptive: big graph + full table for visual; full table for tabular" → Task 1 `modalShowsGraphic` + Task 3 conditional render.
- "complete uncapped data table" → Task 2 `maxRows` + Task 3 `maxRows={Infinity}`.
- "measurement unaffected" → Global Constraint + absolutely-positioned trigger + closed/portaled modal.

**Placeholder scan:** none — every step has concrete code/commands.

**Type consistency:** `capRows`, `modalShowsGraphic`, `MODAL_CHART_W/H` signatures match across
Tasks 1→2→3; `ExpandableGraphic`/`GraphicModal`/`expandable` prop names match across Tasks 3→4.
