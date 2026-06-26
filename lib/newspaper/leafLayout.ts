/**
 * Fixed geometry for a printed leaf (one sheet of the open spread). Every leaf in
 * the finished paper is laid out into THIS exact box, so all pages are guaranteed
 * the same size. Content that doesn't fit flows onto the next leaf of the same
 * topic ("continued on page X"). All values are CSS px at zoom 1; the spread is
 * uniformly zoom-scaled to the viewport, so these never change with screen size.
 */
export const LEAF_W = 600; // sheet width
export const LEAF_H = 824; // sheet height — fixed, identical for every page

export const PAD_X = 28; // left/right paper margin
export const PAD_TOP = 22; // top paper margin
export const PAD_BOTTOM = 30; // bottom margin (holds the folio)

export const COL_GAP = 24; // gutter between the two text columns (holds the column rule)
export const HEADER_GAP = 12; // space between the masthead/topic bar and the columns
export const BLOCK_GAP = 9; // vertical space below each content block

// Two columns of equal width per leaf — the classic newspaper measure.
export const COL_W = Math.floor((LEAF_W - PAD_X * 2 - COL_GAP) / 2);

// Vertical room available for content (below margins). Headers eat into this
// per-leaf; the paginator subtracts the measured header height when packing.
export const CONTENT_H = LEAF_H - PAD_TOP - PAD_BOTTOM;

// Charts/tables are clamped so a single figure can never be taller than a column.
export const FIGURE_MAX_H = 250;
