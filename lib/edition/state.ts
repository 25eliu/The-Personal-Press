import type { TArticle, TNewspaper, TPage } from '@/lib/schema';
import type { SectionPlanItem } from '@/lib/stream/events';

/** Masthead block shown on the front page. Shared by DailyTako + NewspaperView. */
export type Meta = { masthead: string; tagline: string; edition: string; dateLine: string };

/** A point-in-time copy of the editable paper, used for undo. */
export type EditionSnapshot = {
  meta: Meta;
  plan: SectionPlanItem[];
  pages: (TPage | null)[];
};

export type EditionState = EditionSnapshot & {
  history: EditionSnapshot[];
};

/** Keep undo bounded so a long editing session can't grow memory without limit. */
const HISTORY_DEPTH = 20;

export const EMPTY_META: Meta = { masthead: '', tagline: '', edition: '', dateLine: '' };

export const initialEditionState: EditionState = {
  meta: EMPTY_META,
  plan: [],
  pages: [],
  history: [],
};

export type EditionAction =
  // --- stream (generation) — no history push ---
  | { type: 'RESET' }
  | { type: 'SET_FROM_EDITOR'; meta: Meta; plan: SectionPlanItem[] }
  | { type: 'SET_SECTION'; slot: number; page: TPage }
  | { type: 'COMPLETE'; newspaper: TNewspaper }
  // --- copilot edits — push history first ---
  | { type: 'EDIT_ARTICLE'; slot: number; index: number; patch: Partial<TArticle> }
  | { type: 'REPLACE_ARTICLE'; slot: number; index: number; article: TArticle }
  | { type: 'REMOVE_ARTICLE'; slot: number; index: number }
  | { type: 'SET_ARTICLE_SIZE'; slot: number; index: number; size: TArticle['size'] }
  | { type: 'ADD_PULL_QUOTE'; slot: number; index: number; quote: string }
  | { type: 'REORDER_SECTIONS'; order: number[] }
  | { type: 'SET_MASTHEAD'; meta: Partial<Meta> }
  | { type: 'ADD_SECTION'; page: TPage; position?: number }
  | { type: 'REPLACE_PAGE'; slot: number; page: TPage }
  | { type: 'UNDO' };

function snapshot(state: EditionState): EditionSnapshot {
  return { meta: state.meta, plan: state.plan, pages: state.pages };
}

/** Apply an edit, recording the prior state on the bounded history stack. */
function commit(state: EditionState, next: EditionSnapshot): EditionState {
  const history = [...state.history, snapshot(state)].slice(-HISTORY_DEPTH);
  return { ...next, history };
}

/** Rebuild plan items so slots are always a dense 0..n-1 matching the pages array. */
function reindexPlan(pages: (TPage | null)[], prevPlan: SectionPlanItem[]): SectionPlanItem[] {
  return pages.map((p, slot) => ({
    topic: p?.topic ?? prevPlan[slot]?.topic ?? `Page ${slot + 1}`,
    slot,
  }));
}

/** Map an article inside one page to a new article, leaving everything else untouched. */
function mapArticle(
  pages: (TPage | null)[],
  slot: number,
  index: number,
  fn: (a: TArticle) => TArticle,
): (TPage | null)[] {
  return pages.map((p, s) =>
    s === slot && p
      ? { ...p, articles: p.articles.map((a, i) => (i === index ? fn(a) : a)) }
      : p,
  );
}

export function editionReducer(state: EditionState, action: EditionAction): EditionState {
  switch (action.type) {
    case 'RESET':
      return initialEditionState;

    case 'SET_FROM_EDITOR':
      return {
        ...state,
        meta: action.meta,
        plan: action.plan,
        pages: new Array(action.plan.length).fill(null),
      };

    case 'SET_SECTION': {
      const pages = state.pages.map((p, s) => (s === action.slot ? action.page : p));
      return { ...state, pages };
    }

    case 'COMPLETE': {
      // Rebuild from the finished paper so dropped "no fresh reporting" sections
      // disappear from the spreads and section nav (matches the prior onEvent logic).
      const pages = action.newspaper.pages as TPage[];
      return {
        ...state,
        meta: {
          masthead: action.newspaper.masthead,
          tagline: action.newspaper.tagline,
          edition: action.newspaper.edition,
          dateLine: action.newspaper.dateLine,
        },
        plan: pages.map((p, slot) => ({ topic: p.topic, slot })),
        pages,
      };
    }

    case 'EDIT_ARTICLE':
      return commit(state, {
        ...snapshot(state),
        pages: mapArticle(state.pages, action.slot, action.index, (a) => ({ ...a, ...action.patch })),
      });

    case 'REPLACE_ARTICLE':
      return commit(state, {
        ...snapshot(state),
        pages: mapArticle(state.pages, action.slot, action.index, () => action.article),
      });

    case 'SET_ARTICLE_SIZE':
      return commit(state, {
        ...snapshot(state),
        pages: mapArticle(state.pages, action.slot, action.index, (a) => ({ ...a, size: action.size })),
      });

    case 'ADD_PULL_QUOTE':
      // No dedicated pull-quote field on TArticle; surface it as the article's dek.
      return commit(state, {
        ...snapshot(state),
        pages: mapArticle(state.pages, action.slot, action.index, (a) => ({ ...a, dek: action.quote })),
      });

    case 'REMOVE_ARTICLE': {
      const pages = state.pages.map((p, s) =>
        s === action.slot && p
          ? { ...p, articles: p.articles.filter((_, i) => i !== action.index) }
          : p,
      );
      return commit(state, { ...snapshot(state), pages });
    }

    case 'REORDER_SECTIONS': {
      // action.order is the new sequence of CURRENT slot numbers, e.g. [0,2,1].
      const pages = action.order.map((oldSlot) => state.pages[oldSlot] ?? null);
      const plan = action.order.map((oldSlot, newSlot) => ({
        topic: state.plan[oldSlot]?.topic ?? state.pages[oldSlot]?.topic ?? `Page ${newSlot + 1}`,
        slot: newSlot,
      }));
      return commit(state, { ...snapshot(state), plan, pages });
    }

    case 'SET_MASTHEAD':
      return commit(state, { ...snapshot(state), meta: { ...state.meta, ...action.meta } });

    case 'ADD_SECTION': {
      const pos = action.position ?? state.pages.length;
      const clamped = Math.max(0, Math.min(pos, state.pages.length));
      const pages = [...state.pages.slice(0, clamped), action.page, ...state.pages.slice(clamped)];
      return commit(state, { ...snapshot(state), pages, plan: reindexPlan(pages, state.plan) });
    }

    case 'REPLACE_PAGE': {
      const pages = state.pages.map((p, s) => (s === action.slot ? action.page : p));
      return commit(state, { ...snapshot(state), pages, plan: reindexPlan(pages, state.plan) });
    }

    case 'UNDO': {
      const prev = state.history[state.history.length - 1];
      if (!prev) return state;
      return { ...prev, history: state.history.slice(0, -1) };
    }

    default:
      return state;
  }
}
