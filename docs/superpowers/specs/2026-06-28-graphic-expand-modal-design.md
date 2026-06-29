# Click-to-See-Full Graphic Modal — Design

**Date:** 2026-06-28
**Status:** Approved (brainstorming) → ready for implementation plan

## Context

Graphics on the newspaper are deliberately fixed-size so the paginator can measure them
deterministically (`CHART_W`/`CHART_H`), and `GraphicFigure` wraps every graphic with
`overflow-hidden` as a hard backstop. The tabular kinds (`DataTable`, `StandingsTable`,
`ScheduleCard`) cap rows with a muted "+N more" line. The upshot: a graphic never visually
overflows its column — it gets **clipped or capped** to fit, and the reader loses the rest.

The reader needs a way to see the whole thing. When a graphic is too big for its slot, a
small **"⊕ Full"** trigger opens an overlay that renders the graphic on top of the newspaper,
dims (shadows) everything behind it, and closes back to the paper.

## Goals

- Every data graphic carries a small "see full" trigger.
- Clicking it opens a modal **on top of the newspaper** with a dimmed backdrop over everything
  else; the modal shows the full-size graphic and/or the complete (uncapped) data table.
- Closing the modal (Esc, backdrop click, ✕) returns to the newspaper unchanged.
- The paginator's measured page heights are **unaffected** — the printed paper paginates
  identically with or without the feature.

## Design

### A. Trigger — on every data graphic (`GraphicView.tsx`)

`GraphicView` is the single dispatcher every graphic flows through, and it already holds
`graphic` + `table` + `caption`. It gains an `expandable?: boolean` prop (default `false`).

When `expandable` is true it:
- wraps the dispatched graphic in a `relative` container,
- overlays a small newsprint-styled trigger in the **top-right corner**: a boxed `⊕ Full`
  (inked, `text-[9px]`, uppercase, hairline border, mono-news idiom),
- owns the open/closed `useState` and renders `<GraphicModal>` when open.

The trigger is **absolutely positioned**, so it adds **zero layout height** — the paginator's
hidden measuring pass (which renders the same `BlockView`/`GraphicView`) measures the identical
height it does today. The modal is closed by default and portals out, contributing no height.

`BlockView.tsx` sets `expandable` on the printed graphic (the static branch) and on the
live-edit graphic reload. Previews and the measuring pass remain correct either way.

### B. The modal — `GraphicModal.tsx` (new)

A portal to `document.body`:
- fixed full-screen backdrop `bg-black/60` that **shadows the entire newspaper**,
- a centered `paper`-styled panel, `max-w-[760px]`, `max-h-[88vh]`, body scrolls for long tables,
- closes on **Esc** (keydown listener), **backdrop click**, and an **✕** button in the corner,
- `role="dialog"`, `aria-modal="true"`, focus moved into the panel on open,
- z-index above the reader and above the live-edit `-z-10` scrim.

Contents adapt by kind so there is never a redundant double-table:
- **Visual graphs** (`chart`, `scatter`, `composition`): a **large** graphic on top — re-render
  via `GraphicView` (not expandable) at a bigger fixed `width`/`height` (`NewsChart`/`ScatterPlot`
  already accept `width`/`height`) — **＋ the complete uncapped data table** below.
- **Already-tabular kinds** (`standings`, `schedule`, `stat`): the **full uncapped table** only —
  that already *is* the full thing; no second redundant table.

### C. Full table — `DataTable.tsx`

Add an optional `maxRows?: number` (default `8`, current behavior). The modal renders `DataTable`
with `maxRows={Infinity}` → every row, no "+N more" line. The printed paper is untouched.

## Key files

- `components/newspaper/GraphicView.tsx` — `expandable` prop, trigger overlay, modal state.
- `components/newspaper/GraphicModal.tsx` — **new** portal overlay (backdrop + panel + close).
- `components/newspaper/DataTable.tsx` — optional `maxRows` prop for the uncapped full table.
- `components/newspaper/BlockView.tsx` — pass `expandable` on the printed + live-edit graphics.

## Reuse, not rebuild

- `GraphicView` dispatch + `GraphicFigure` box for the large in-modal graphic.
- `DataTable` for the full table (just lift its row cap via a prop).
- The existing `paper` surface styling and mono-news trigger idiom.
- `NewsChart`/`ScatterPlot`'s existing `width`/`height` props for the larger in-modal render.

## Out of scope

- Per-kind uncapping of `StandingsTable`/`ScheduleCard` *visuals* in the modal — the uncapped
  `DataTable` already shows every row, so those kinds rely on the full table for completeness.
- Runtime DOM overflow detection — the trigger shows on every data graphic, not conditionally.

## Verification

- `npm test` — `DataTable` honors `maxRows` (capped default vs uncapped `Infinity`);
  `GraphicView` renders the trigger only when `expandable`; `GraphicModal` opens and closes on
  Esc / backdrop / ✕. Existing graphic/pagination tests stay green. `npm run build` + `tsc` clean.
- `/browse` the running app: a clipped chart shows the `⊕ Full` trigger; clicking dims the whole
  newspaper and renders the full chart + complete table on top; Esc/backdrop/✕ returns to the
  paper; pages still paginate identically (no layout shift from the trigger).
