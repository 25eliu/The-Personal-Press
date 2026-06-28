'use client';
import { createElement, useEffect, useRef, useState, type Dispatch, type RefObject } from 'react';
import { useCopilotAction, useCopilotReadable } from '@copilotkit/react-core';
import type { EditionAction, EditionState } from '@/lib/edition/state';
import type { TArticle, TGraphicKind } from '@/lib/schema';
import { sliceTableRows } from '@/lib/newspaper/chartSpec';
import { type GraphicHint, buildGraphic, graphicPatchFromJson, summarizeGraphic } from '@/lib/newspaper/graphic';
import { validateArticlePatch, validatePage } from '@/lib/edition/validate';
import { hasRealContent } from '@/lib/agents/reporter';
import { streamEditSection } from '@/lib/stream/editClient';
import { articleToContext, sectionToContext, shortSectionTitle } from '@/lib/edition/grounding';
import { streamAskTako } from '@/lib/stream/askClient';
import type { AskSource } from '@/lib/stream/askEvents';
import { ResearchProgress } from '@/components/copilot/ResearchProgress';
import type { GraphicPreview, ResearchStatus } from '@/lib/edition/researchView';

const GRAPHIC_KIND_LIST = 'chart, scatter, composition, standings, stat, schedule';
import { useLiveEdit } from '@/lib/edition/liveEdit';

const SIZES = ['lead', 'standard', 'brief'] as const;

/**
 * Registers the copilot's readable view of the edition and all edit actions.
 * Local edits validate against the zod schema then dispatch immediately (auto-apply);
 * research-backed edits stream Tako activity into the chat. Called unconditionally
 * from DailyTako; the actions are only reachable once <CopilotKit> has mounted.
 */
export function useEditionCopilot(
  state: EditionState,
  dispatch: Dispatch<EditionAction>,
  abortRef: RefObject<AbortController | null>,
  onNavigate?: (slot: number) => void,
) {
  // Always-current snapshot so action handlers never close over stale state.
  // Updated in an effect (not during render) so the ref is committed, not torn.
  // Action handlers fire from chat interactions long after effects flush.
  const stateRef = useRef(state);
  useEffect(() => {
    stateRef.current = state;
  });

  // Drives the in-paper "person editing" animation (erase → type). The real
  // dispatch is deferred until live.play() resolves so the page doesn't repaginate
  // mid-animation; outside the provider this is a no-op that resolves instantly.
  const live = useLiveEdit();

  // ONE shared live surface for whichever research action is currently running — the
  // tool log, the outlets being sourced, the streaming answer prose, and a terminal
  // status line — tagged with the active run's monotonic id. Only one action writes at
  // a time (enforced by beginResearchRun() below). Each chat bubble claims its OWN
  // runId and renders only data carrying that id (see reduceResearchView), so a fresh
  // bubble never shows the previous run's leftover content sitting on the surface.
  const [surface, setSurface] = useState<{
    runId: number;
    lines: string[];
    sources: string[];
    answer: string;
    done: string | null;
    graphic: GraphicPreview | null;
    nav: { slot: number; label: string } | null;
  }>({ runId: 0, lines: [], sources: [], answer: '', done: null, graphic: null, nav: null });

  // Run ids already claimed by a bubble — seeded with the pre-first-run sentinel 0 so
  // no bubble ever binds the initial empty surface. Bubbles add their claimed id here.
  const claimedRunIds = useRef<Set<number>>(new Set([0]));

  // Thin shims preserving the old setter names/signatures so the stream callbacks in
  // runResearch()/askTako stay unchanged — each just patches one field of the surface.
  const setResearchLines = (fn: (prev: string[]) => string[]) =>
    setSurface((s) => ({ ...s, lines: fn(s.lines) }));
  const setResearchAnswer = (v: string | ((prev: string) => string)) =>
    setSurface((s) => ({ ...s, answer: typeof v === 'function' ? v(s.answer) : v }));
  const setResearchDone = (v: string | null) => setSurface((s) => ({ ...s, done: v }));
  // Surface the graphic a research run produced so it mirrors into the chat bubble (frozen
  // with the rest of the snapshot on completion). Cleared at the start of every run.
  const setResearchGraphic = (v: GraphicPreview | null) => setSurface((s) => ({ ...s, graphic: v }));
  const graphicPreviewFor = (a: TArticle | undefined): GraphicPreview | null =>
    a && a.graphic && a.table ? { graphic: a.graphic, table: a.table, caption: a.headline } : null;

  // The section a change landed on, used for the chat bubble's "↳ See it in …" jump link.
  const labelForSlot = (slot: number): string => stateRef.current.pages[slot]?.topic ?? `Page ${slot + 1}`;
  const navFor = (slot: number | undefined): { slot: number; label: string } | null =>
    typeof slot === 'number' ? { slot, label: labelForSlot(slot) } : null;
  const setResearchNav = (v: { slot: number; label: string } | null) => setSurface((s) => ({ ...s, nav: v }));

  // Every research action's render is the SAME shared-surface bubble (only the title
  // differs) — one helper instead of five near-identical createElement blocks.
  const renderResearch = (title: string, status: ResearchStatus) =>
    createElement(ResearchProgress, {
      title,
      runId: surface.runId,
      status,
      surfaceDone: surface.done !== null,
      claimed: claimedRunIds.current,
      lines: surface.lines,
      sources: surface.sources,
      answer: surface.answer,
      done: surface.done,
      graphic: surface.graphic,
      nav: surface.nav,
      onNavigate,
    });

  // Each research/ask action gets its OWN abort controller and a monotonic run id.
  // Sharing one signal/surface (the old bug) let a still-streaming run bleed its
  // content and sources into the next action's chat bubble.
  const researchAbortRef = useRef<AbortController | null>(null);
  const researchRunId = useRef(0);

  /**
   * Open a fresh research run: cancel any in-flight one (so two never overlap), wire
   * it to abort alongside a full regeneration ("New paper"), re-tag the surface with a
   * fresh empty run, and hand back this run's signal plus an `isCurrent()` fence. Every
   * stream callback guards on `isCurrent()` so a superseded/aborted stream can never
   * mutate the surface.
   */
  const beginResearchRun = () => {
    researchAbortRef.current?.abort();
    const controller = new AbortController();
    researchAbortRef.current = controller;
    abortRef.current?.signal.addEventListener('abort', () => controller.abort(), { once: true });
    const runId = ++researchRunId.current;
    setSurface({ runId, lines: [], sources: [], answer: '', done: null, graphic: null, nav: null });
    return { signal: controller.signal, isCurrent: () => researchRunId.current === runId };
  };

  // Merge newly-discovered source labels, deduped case-insensitively, order-preserving.
  const mergeSources = (incoming: string[]) =>
    setSurface((s) => {
      const seen = new Set(s.sources.map((x) => x.toLowerCase()));
      const next = [...s.sources];
      for (const x of incoming) {
        if (seen.has(x.toLowerCase())) continue;
        seen.add(x.toLowerCase());
        next.push(x);
      }
      return { ...s, sources: next };
    });

  const getArticle = (slot: number, index: number): TArticle | undefined =>
    stateRef.current.pages[slot]?.articles[index];

  // A compact, copilot-facing view of an article's graphic: its kind + a data summary
  // (ranges, not raw rows) plus the columns available to switch to — enough to reason
  // about ("what's the peak?") and reshape ("plot the other series", "make it standings")
  // without flooding context. No graphic → null.
  const graphicReadable = (a: TArticle) =>
    a.graphic && a.table ? { ...summarizeGraphic(a.graphic, a.table), columns: a.table.columns } : null;

  const runResearch = async (topic: string, isFront: boolean, context?: string) => {
    const { signal, isCurrent } = beginResearchRun();
    let errored = false;
    const page = await streamEditSection(
      { topic, isFront, context },
      (e) => {
        if (!isCurrent()) return;   // a superseded run must not touch the shared surface
        if (e.type === 'tool_activity') {
          // A 'sources' dispatch feeds the outlet chips; a real tool call feeds the log.
          if (e.sources?.length) mergeSources(e.sources);
          else setResearchLines((prev) => [...prev, e.detail ? `${e.label} — “${e.detail}”` : e.label]);
        } else if (e.type === 'token') {
          setResearchAnswer((prev) => prev + e.text);    // streams the forming section into the chat bubble
        } else if (e.type === 'error') {
          errored = true;
          setResearchDone(`⚠ ${e.message}`);
        }
      },
      signal,
    );
    // Always stamp a terminal line once the stream ends (unless an error already did),
    // so a leftover surface is never left un-done — that is what lets the next bubble's
    // surfaceDone guard refuse to bind it. The handler overwrites this with its own
    // message on success.
    if (isCurrent() && !errored) setResearchDone('Done.');
    return page;
  };

  // --- Readable state -------------------------------------------------------
  useCopilotReadable({
    description: 'Newspaper masthead block (masthead, tagline, edition, dateLine).',
    value: state.meta,
  });

  useCopilotReadable({
    description:
      'The current edition. Address every edit by (slot, index): slot is the page (0 = front page), ' +
      'index is the 0-based article position within that page.',
    value: state.pages.map((page, slot) =>
      page == null
        ? { slot, topic: state.plan[slot]?.topic ?? `Page ${slot + 1}`, status: 'pending' }
        : {
            slot,
            topic: page.topic,
            articles: page.articles.map((a, index) => ({
              index,
              kicker: a.kicker,
              headline: a.headline,
              dek: a.dek,
              byline: a.byline,
              size: a.size,
              body: a.body,
              graphic: graphicReadable(a),
              sourceCount: a.sources.length,
            })),
          },
    ),
  });

  // --- Local edit actions (auto-apply) -------------------------------------
  useCopilotAction({
    name: 'editArticle',
    description:
      'Rewrite parts of an existing article in place (e.g. make it punchier, fix the headline, ' +
      'tighten the body). Provide only the fields you are changing. You write the new prose yourself.',
    parameters: [
      { name: 'slot', type: 'number', description: 'Page slot (0 = front page).', required: true },
      { name: 'index', type: 'number', description: '0-based article index within the page.', required: true },
      { name: 'headline', type: 'string', description: 'New headline.', required: false },
      { name: 'dek', type: 'string', description: 'New subtitle/deck.', required: false },
      { name: 'body', type: 'string', description: 'New body text (respect the word cap for the size).', required: false },
      { name: 'kicker', type: 'string', description: 'New kicker/category label.', required: false },
      { name: 'byline', type: 'string', description: 'New byline.', required: false },
    ],
    handler: async ({ slot, index, headline, dek, body, kicker, byline }) => {
      const current = getArticle(slot, index);
      if (!current) return `No article at (slot ${slot}, index ${index}).`;
      const patch: Partial<TArticle> = {};
      if (headline !== undefined) patch.headline = headline;
      if (dek !== undefined) patch.dek = dek;
      if (body !== undefined) patch.body = body;
      if (kicker !== undefined) patch.kicker = kicker;
      if (byline !== undefined) patch.byline = byline;
      // Guard against a content-less call reporting a fake success: the model must
      // actually write the new text in the arguments for a local edit to apply.
      if (Object.keys(patch).length === 0) {
        return 'No new text provided. To edit an article you must write the replacement headline/dek/body yourself in the arguments. If you have no new wording and the reader wants a different take, use replaceWithResearch instead.';
      }
      const changed = (Object.entries(patch) as [keyof TArticle, unknown][]).some(
        ([k, v]) => current[k] !== v,
      );
      if (!changed) return 'That matches the current text — nothing changed. Provide different wording.';
      const result = validateArticlePatch(current, patch);
      if (!result.ok) return result.error;
      // Body rewrites play the live erase-then-type animation, then commit. Other
      // field-only edits (headline, kicker…) apply instantly.
      if (patch.body !== undefined && patch.body !== current.body) {
        try {
          await live.play({ slot, articleIndex: index, oldBody: current.body, newBody: patch.body });
          dispatch({ type: 'EDIT_ARTICLE', slot, index, patch });
        } finally {
          live.end();
        }
      } else {
        dispatch({ type: 'EDIT_ARTICLE', slot, index, patch });
      }
      return `Updated “${result.article.headline}”.`;
    },
    render: ({ status, args }) =>
      createElement(ResearchProgress, {
        title: 'Editing article',
        lines: args?.headline ? [`New headline: “${args.headline}”`] : ['Rewriting…'],
        done: status === 'complete' ? 'Updated.' : undefined,
        nav: status === 'complete' ? navFor(args?.slot) : null,
        onNavigate,
      }),
  });

  // --- Reshape an existing data chart (reads the chart in readable state above) ------
  useCopilotAction({
    name: 'editGraphic',
    description:
      "Reshape an article's EXISTING graphic in place using ONLY the data already in its table: " +
      'switch its KIND (' + GRAPHIC_KIND_LIST + ') among shapes those SAME numbers support, ' +
      'change the chart sub-type (line/bar/area), pick the label/category column (labelColumn) and the ' +
      'numeric columns plotted (valueColumns), set the unit, or filter to a window of rows (lastN ' +
      'most-recent rows, or an inclusive fromLabel/toLabel range over the label column). Column names ' +
      "must match the data (see each article's graphic + columns in the readable state). It CANNOT " +
      "introduce data the table lacks — e.g. it can't turn a score table into a fixtures schedule. To " +
      'show genuinely NEW data, call askTako then addChart, or use replaceArticleWithResearch. Only works ' +
      'where a graphic already exists; if a story has none, use addChart or refreshChart. Does not touch the text.',
    parameters: [
      { name: 'slot', type: 'number', description: 'Page slot (0 = front page).', required: true },
      { name: 'index', type: 'number', description: '0-based article index.', required: true },
      { name: 'kind', type: 'string', description: `Graphic kind to switch to: ${GRAPHIC_KIND_LIST}. Omit to keep the current kind.`, required: false },
      { name: 'type', type: 'string', description: 'For a chart graphic, the sub-type: line, bar, or area.', required: false },
      { name: 'labelColumn', type: 'string', description: 'Column to use as the x-axis/category/label (must exist in the data).', required: false },
      { name: 'valueColumns', type: 'string[]', description: 'Numeric columns to plot as series (must exist in the data).', required: false },
      { name: 'unit', type: 'string', description: 'Axis unit, e.g. "$" or "%".', required: false },
      { name: 'lastN', type: 'number', description: 'Keep only the last N rows (e.g. "last 5 years").', required: false },
      { name: 'fromLabel', type: 'string', description: 'Start of an inclusive label-column window (e.g. "2020").', required: false },
      { name: 'toLabel', type: 'string', description: 'End of an inclusive label-column window (e.g. "2025").', required: false },
    ],
    handler: async ({ slot, index, kind, type, labelColumn, valueColumns, unit, lastN, fromLabel, toLabel }) => {
      const current = getArticle(slot, index);
      if (!current) return `No article at (slot ${slot}, index ${index}).`;
      if (!current.table || !current.graphic) {
        return 'That story has no graphic to edit. Use addChart to draw one, or refreshChart to research fresh data.';
      }
      const ranged =
        lastN || fromLabel || toLabel
          ? sliceTableRows(current.table, { lastN, from: fromLabel, to: toLabel })
          : current.table;
      const targetKind = (kind as TGraphicKind | undefined) ?? current.graphic.kind;
      const hint: GraphicHint = {
        type: type as GraphicHint['type'],
        labelColumn,
        valueColumns,
        unit,
      };
      const graphic = buildGraphic(targetKind, ranged, hint);
      if (!graphic) {
        return `That kind needs data this story doesn't have (e.g. a schedule needs real dates/fixtures). editGraphic only reshapes the numbers already present — to show genuinely new data, call askTako to fetch it then addChart, or use replaceArticleWithResearch.`;
      }
      const patch: Partial<TArticle> = { graphic, table: ranged };
      const result = validateArticlePatch(current, patch);
      if (!result.ok) return result.error;
      dispatch({ type: 'EDIT_ARTICLE', slot, index, patch });
      const what = [
        kind ? `${graphic.kind}` : null,
        type ? `${type}` : null,
        labelColumn ? `label: ${labelColumn}` : null,
        valueColumns ? `series: ${valueColumns.join(', ')}` : null,
        lastN || fromLabel || toLabel ? `${ranged.rows.length} rows` : null,
        unit ? `unit ${unit}` : null,
      ]
        .filter(Boolean)
        .join(', ');
      return `Reshaped the graphic${what ? ` (${what})` : ''}.`;
    },
    render: ({ status, args }) =>
      createElement(ResearchProgress, {
        title: 'Reshaping graphic',
        lines: ['Redrawing…'],
        done: status === 'complete' ? 'Graphic updated.' : undefined,
        nav: status === 'complete' ? navFor(args?.slot) : null,
        onNavigate,
      }),
  });

  useCopilotAction({
    name: 'addChart',
    description:
      'Draw a NEW graphic on a story from numbers you provide directly — the on-demand way to add a ' +
      'visual WITHOUT a full re-research pass. Supply a small REAL data table as JSON; the BEST-FITTING ' +
      'graphic is auto-picked from its shape (a single figure → stat, a league table → standings, ' +
      'fixtures → schedule, parts-of-a-whole → composition, a time series/comparison → chart). Pass ' +
      '`kind` to force a specific one. Adds a graphic where a story has none, or replaces an existing ' +
      'one. When you need current figures (standings, prices, scores), call askTako FIRST to fetch ' +
      'them, then pass those real numbers here — never invent them.',
    parameters: [
      { name: 'slot', type: 'number', description: 'Page slot (0 = front page).', required: true },
      { name: 'index', type: 'number', description: '0-based article index to attach the graphic to.', required: true },
      {
        name: 'table',
        type: 'string',
        description:
          'The data as JSON: { "caption", "columns" (header names; the FIRST column is the label/category/' +
          'date), "rows" (array of string-cell arrays) }. Use REAL numbers from askTako or from the story. ' +
          'For standings include the stat columns; for a single figure one row is fine; for a schedule put ' +
          'the date/time first.',
        required: true,
      },
      { name: 'kind', type: 'string', description: `Force a graphic kind: ${GRAPHIC_KIND_LIST}. Omit to auto-pick from the data shape.`, required: false },
      { name: 'type', type: 'string', description: 'For a chart graphic, the sub-type: line, bar, or area. Omit to infer.', required: false },
      { name: 'labelColumn', type: 'string', description: 'Column for the x-axis/category/label. Omit to use the first column.', required: false },
      { name: 'valueColumns', type: 'string[]', description: 'Numeric columns to plot as series. Omit to use every numeric column.', required: false },
      { name: 'unit', type: 'string', description: 'Axis unit, e.g. "$" or "%".', required: false },
    ],
    handler: async ({ slot, index, table, kind, type, labelColumn, valueColumns, unit }) => {
      const current = getArticle(slot, index);
      if (!current) return `No article at (slot ${slot}, index ${index}).`;
      const hint: GraphicHint = { type: type as GraphicHint['type'], labelColumn, valueColumns, unit };
      const built = graphicPatchFromJson(table, kind as TGraphicKind | undefined, hint);
      if ('error' in built) return built.error;
      const patch: Partial<TArticle> = { table: built.table, graphic: built.graphic };
      const result = validateArticlePatch(current, patch);
      if (!result.ok) return result.error;
      dispatch({ type: 'EDIT_ARTICLE', slot, index, patch });
      return built.graphic
        ? `Added a ${built.graphic.kind} graphic to the "${current.headline}" story.`
        : `That data didn't fit a chart shape, so I set it as a table on the "${current.headline}" story.`;
    },
    render: ({ status, args }) =>
      createElement(ResearchProgress, {
        title: 'Drawing graphic',
        lines: ['Plotting the data…'],
        done: status === 'complete' ? 'Graphic added.' : undefined,
        nav: status === 'complete' ? navFor(args?.slot) : null,
        onNavigate,
      }),
  });

  useCopilotAction({
    name: 'setArticleSize',
    description:
      'Resize an article to lead, standard, or brief. When shrinking, also call editArticle to tighten the body to the cap.',
    parameters: [
      { name: 'slot', type: 'number', description: 'Page slot.', required: true },
      { name: 'index', type: 'number', description: 'Article index.', required: true },
      { name: 'size', type: 'string', description: 'One of: lead, standard, brief.', required: true },
    ],
    handler: async ({ slot, index, size }) => {
      if (!SIZES.includes(size as TArticle['size'])) return `Size must be one of ${SIZES.join(', ')}.`;
      if (!getArticle(slot, index)) return `No article at (slot ${slot}, index ${index}).`;
      dispatch({ type: 'SET_ARTICLE_SIZE', slot, index, size: size as TArticle['size'] });
      return `Resized to ${size}.`;
    },
  });

  useCopilotAction({
    name: 'removeArticle',
    description: 'Delete an article from a page. Refuses if it would leave the page empty.',
    parameters: [
      { name: 'slot', type: 'number', description: 'Page slot.', required: true },
      { name: 'index', type: 'number', description: 'Article index.', required: true },
    ],
    handler: async ({ slot, index }) => {
      const page = stateRef.current.pages[slot];
      if (!page || !page.articles[index]) return `No article at (slot ${slot}, index ${index}).`;
      if (page.articles.length <= 1) {
        return 'That is the only story on the page — removing it would leave the page empty. Remove or replace the whole section instead.';
      }
      dispatch({ type: 'REMOVE_ARTICLE', slot, index });
      return 'Removed the story.';
    },
  });

  useCopilotAction({
    name: 'addPullQuote',
    description: "Add or replace an article's pull-quote (rendered as its deck/subtitle).",
    parameters: [
      { name: 'slot', type: 'number', description: 'Page slot.', required: true },
      { name: 'index', type: 'number', description: 'Article index.', required: true },
      { name: 'quote', type: 'string', description: 'The pull-quote text.', required: true },
    ],
    handler: async ({ slot, index, quote }) => {
      if (!getArticle(slot, index)) return `No article at (slot ${slot}, index ${index}).`;
      dispatch({ type: 'ADD_PULL_QUOTE', slot, index, quote });
      return 'Added the pull-quote.';
    },
  });

  useCopilotAction({
    name: 'reorderSections',
    description:
      'Reorder the pages. Provide the new sequence as an array of CURRENT slot numbers, ' +
      'e.g. [0,2,1] keeps the front page first then swaps the next two.',
    parameters: [
      { name: 'order', type: 'number[]', description: 'Permutation of current slot numbers.', required: true },
    ],
    handler: async ({ order }) => {
      const n = stateRef.current.pages.length;
      const valid =
        Array.isArray(order) &&
        order.length === n &&
        new Set(order).size === n &&
        order.every((s) => Number.isInteger(s) && s >= 0 && s < n);
      if (!valid) return `Order must be a permutation of 0..${n - 1}.`;
      dispatch({ type: 'REORDER_SECTIONS', order });
      return 'Reordered the sections.';
    },
  });

  useCopilotAction({
    name: 'setMasthead',
    description: 'Change the masthead, tagline, edition line, or date line. Provide only the fields you are changing.',
    parameters: [
      { name: 'masthead', type: 'string', description: 'Newspaper name.', required: false },
      { name: 'tagline', type: 'string', description: 'Tagline under the masthead.', required: false },
      { name: 'edition', type: 'string', description: 'Edition line (e.g. "Vol. I · Tuesday").', required: false },
      { name: 'dateLine', type: 'string', description: 'Date/location line.', required: false },
    ],
    handler: async ({ masthead, tagline, edition, dateLine }) => {
      const meta: Partial<typeof state.meta> = {};
      if (masthead !== undefined) meta.masthead = masthead;
      if (tagline !== undefined) meta.tagline = tagline;
      if (edition !== undefined) meta.edition = edition;
      if (dateLine !== undefined) meta.dateLine = dateLine;
      if (Object.keys(meta).length === 0) return 'Nothing to change.';
      dispatch({ type: 'SET_MASTHEAD', meta });
      return 'Updated the masthead.';
    },
  });

  useCopilotAction({
    name: 'undo',
    description: 'Undo the most recent edit to the paper.',
    parameters: [],
    handler: async () => {
      if (stateRef.current.history.length === 0) return 'Nothing to undo.';
      dispatch({ type: 'UNDO' });
      return 'Reverted the last edit.';
    },
  });

  // --- Tako Q&A (does not change the paper) --------------------------------
  useCopilotAction({
    name: 'askTako',
    description:
      'Answer ANY factual / current-events / numeric question by fetching live data — it searches ' +
      'BOTH Tako (figures, stats, time series) AND the open web (fresh narrative) together, so the ' +
      'reply is up to date. Call this for anything that could have changed (latest GDP, prices, ' +
      'scores, who-won, today’s news) instead of answering from memory. Does NOT change the newspaper.',
    parameters: [
      { name: 'query', type: 'string', description: 'The factual question to research with Tako.', required: true },
    ],
    handler: async ({ query }) => {
      const { signal, isCurrent } = beginResearchRun();
      let answer = '';
      let citations: AskSource[] = [];
      try {
        await streamAskTako(
          query,
          (e) => {
            if (!isCurrent()) return;   // a superseded run must not touch the shared surface
            if (e.type === 'tool') {
              setResearchLines((prev) => [...prev, e.detail ? `${e.label} — “${e.detail}”` : e.label]);
            } else if (e.type === 'sources') {
              mergeSources(e.sources);
            } else if (e.type === 'token') {
              answer += e.text;
              setResearchAnswer(answer);
            } else if (e.type === 'done') {
              answer = e.answer;
              citations = e.sources;
              setResearchAnswer(e.answer);
            } else if (e.type === 'error') {
              setResearchDone(`⚠ ${e.message}`);
            }
          },
          signal,
        );
      } catch (err) {
        setResearchDone('⚠ Tako lookup failed.');
        return err instanceof Error ? `Tako lookup failed: ${err.message}` : 'Tako lookup failed.';
      }
      setResearchDone('Done.');
      const cited = citations.map((s) => (s.url ? `- ${s.name} (${s.url})` : `- ${s.name}`)).join('\n');
      const body = answer.trim() || 'No fresh data found for that question.';
      return cited ? `${body}\n\nSources:\n${cited}` : body;
    },
    render: ({ status, args }) => renderResearch(`Asking Tako: ${args?.query ?? '…'}`, status),
  });

  // --- Research-backed edits (Tako, live in chat) --------------------------
  useCopilotAction({
    name: 'addSection',
    description:
      'Research a brand-new topic with Tako and add it to the paper as a new section/page. ' +
      'Use for requests like "add a section on how US GDP is looking". This fetches live data.',
    parameters: [
      { name: 'topic', type: 'string', description: 'The section topic to research and add.', required: true },
      { name: 'position', type: 'number', description: 'Optional page position; defaults to the end.', required: false },
      { name: 'groundingSlot', type: 'number', description: 'If the request refers to or builds on an existing section, its slot — so the research is grounded in that coverage.', required: false },
    ],
    handler: async ({ topic, position, groundingSlot }) => {
      const src = typeof groundingSlot === 'number' ? stateRef.current.pages[groundingSlot] : undefined;
      const context = src ? sectionToContext(src) : undefined;
      const page = await runResearch(topic, false, context);
      if (!page) return `No fresh reporting found for “${topic}”.`;
      const v = validatePage(page);
      if (!v.ok) return v.error;
      if (!hasRealContent(v.page)) return `No fresh reporting found for “${topic}”.`;
      const finalPage = { ...v.page, topic: shortSectionTitle(v.page.topic) };
      // The reducer inserts at this clamped index; stateRef still holds the pre-insert
      // pages here (it updates in an effect), so its length is the old section count.
      const insertAt = Math.max(0, Math.min(position ?? stateRef.current.pages.length, stateRef.current.pages.length));
      dispatch({ type: 'ADD_SECTION', page: finalPage, position });
      setResearchGraphic(graphicPreviewFor(finalPage.articles.find((a) => a.graphic && a.table)));
      setResearchNav({ slot: insertAt, label: finalPage.topic });
      setResearchDone(`Added “${finalPage.topic}”.`);
      return `Added a new section: “${finalPage.topic}”.`;
    },
    render: ({ status, args }) => renderResearch(`Researching: ${args?.topic ?? '…'}`, status),
  });

  useCopilotAction({
    name: 'replaceWithResearch',
    description:
      'When the reader dislikes a section and wants it changed/replaced WITHOUT giving you the exact ' +
      'new text, re-research the topic with Tako and replace the WHOLE section (page) with fresh, ' +
      'sourced reporting — its title updates to the new subject too. Make a SINGLE call with the page ' +
      "slot and a refined topic/angle that addresses the reader's objection.",
    parameters: [
      { name: 'slot', type: 'number', description: 'Page slot to replace (0 = front page).', required: true },
      { name: 'topic', type: 'string', description: 'Refined research topic/angle reflecting what the reader wants the section to cover instead.', required: true },
    ],
    handler: async ({ slot, topic }) => {
      const page = stateRef.current.pages[slot];
      if (!page) return `No section at slot ${slot}.`;
      const lead = page.articles[0];
      // Erase the WHOLE section NOW — the lead title-and-all typewrites out while every
      // other article on the page collapses — so the reader watches the entire section
      // clear, then the caret waits while we research.
      const run = live.begin({
        slot,
        articleIndex: 0,
        headline: lead?.headline,
        dek: lead?.dek,
        body: lead?.body ?? '',
        whole: true, // clear the lead's chart/table/sources too, not just its text
        sectionScope: true, // clear EVERY article on the page, not just the lead
      });
      try {
        const fresh = await runResearch(topic, slot === 0, sectionToContext(page));
        if (!fresh) return `No fresh reporting found for “${topic}”.`;
        const v = validatePage(fresh);
        if (!v.ok) return v.error;
        if (!hasRealContent(v.page)) return `No fresh reporting found for “${topic}”.`;
        const finalPage = { ...v.page, topic: shortSectionTitle(v.page.topic) };
        await run.erased; // the whole section is now cleared; the caret holds
        // Now that the new section is fully loaded, commit it and stream it in: because we
        // commit FIRST (while the section is blank) and only then reveal, the new content is
        // measured into its FINAL layout, so it loads in place with no end-of-run repaginate
        // "refresh". The whole section — header, lead and every story — rises in together.
        dispatch({ type: 'REPLACE_PAGE', slot, page: finalPage });
        live.end(run.id, { revealSlot: slot });
        setResearchGraphic(graphicPreviewFor(finalPage.articles.find((a) => a.graphic && a.table)));
        setResearchNav({ slot, label: finalPage.topic });
        setResearchDone(`Replaced “${page.topic}” → “${finalPage.topic}”.`);
        return `Replaced the “${page.topic}” section with freshly-researched reporting: “${finalPage.topic}”.`;
      } finally {
        live.end(run.id); // no-op on success (stale id); restores the original on early return
      }
    },
    render: ({ status, args }) => renderResearch(`Re-researching: ${args?.topic ?? '…'}`, status),
  });

  useCopilotAction({
    name: 'replaceArticleWithResearch',
    description:
      'When the reader wants ONE specific story within a section changed/updated with fresh ' +
      'data but does NOT give you the new text, re-research just that story with Tako and replace ' +
      'ONLY that article — the rest of the page and the section title stay intact. Use this ' +
      '(not replaceWithResearch) whenever the request points at a single story rather than the ' +
      'whole section.',
    parameters: [
      { name: 'slot', type: 'number', description: 'Page slot (0 = front page).', required: true },
      { name: 'index', type: 'number', description: '0-based article index of the story to replace.', required: true },
      { name: 'topic', type: 'string', description: 'Refined research angle for THIS story (short, headline-style; include league/place/year for precision).', required: true },
    ],
    handler: async ({ slot, index, topic }) => {
      const page = stateRef.current.pages[slot];
      const current = page?.articles[index];
      if (!page || !current) return `No article at (slot ${slot}, index ${index}).`;
      // Erase this story NOW — title and all — so the reader jumps to it and watches it
      // clear out, then the caret waits while we research just this story.
      const run = live.begin({
        slot,
        articleIndex: index,
        headline: current.headline,
        dek: current.dek,
        body: current.body,
        whole: true, // clear this story's chart/table/sources too, not just its text
      });
      try {
        const fresh = await runResearch(topic, slot === 0, articleToContext(current, page.topic));
        if (!fresh) return `No fresh reporting found for “${topic}”.`;
        const v = validatePage(fresh);
        if (!v.ok) return v.error;
        if (!hasRealContent(v.page)) return `No fresh reporting found for “${topic}”.`;
        // Take the fresh page's primary story, but keep THIS article's size so the page
        // layout (lead/standard/brief mix) is preserved.
        const picked = v.page.articles.find((a) => a.size === 'lead') ?? v.page.articles[0];
        const article: TArticle = { ...picked, size: current.size };
        await run.erased; // ensure the erase finished before we type the new copy in
        await live.type(run.id, {
          headline: article.headline,
          dek: article.dek,
          body: article.body,
          table: article.table,
          graphic: article.graphic,
          sources: article.sources,
          kicker: article.kicker,
          byline: article.byline,
        });
        dispatch({ type: 'REPLACE_ARTICLE', slot, index, article });
        setResearchGraphic(graphicPreviewFor(article));
        setResearchNav(navFor(slot));
        setResearchDone(`Updated the “${article.headline}” story.`);
        return `Replaced that story with freshly-researched reporting: “${article.headline}”.`;
      } finally {
        live.end(run.id); // commit on success; restore the original on any early return
      }
    },
    render: ({ status, args }) => renderResearch(`Re-researching story: ${args?.topic ?? '…'}`, status),
  });

  useCopilotAction({
    name: 'refreshChart',
    description:
      "Re-research a page's topic with Tako and refresh the chart on one of its articles with the latest data.",
    parameters: [
      { name: 'slot', type: 'number', description: 'Page slot whose article chart to refresh.', required: true },
      { name: 'index', type: 'number', description: 'Article index to attach the fresh chart to.', required: true },
    ],
    handler: async ({ slot, index }) => {
      const page = stateRef.current.pages[slot];
      if (!page || !page.articles[index]) return `No article at (slot ${slot}, index ${index}).`;
      const fresh = await runResearch(page.topic, slot === 0);
      if (!fresh) return 'No fresh data found for that topic.';
      // Avoid handing this article a chart whose data already appears on a SIBLING story;
      // fall back to the first data-backed chart only if every fresh one collides.
      const usedOnPage = new Set(
        page.articles
          .filter((_, i) => i !== index)
          .map((a) => a.table?.caption)
          .filter(Boolean) as string[],
      );
      const pick =
        fresh.articles.find((a) => a.graphic && a.table && !usedOnPage.has(a.table.caption)) ??
        fresh.articles.find((a) => a.graphic && a.table);
      if (!pick || !(pick.graphic && pick.table)) {
        return 'No fresh chart data available for that topic.';
      }
      dispatch({
        type: 'EDIT_ARTICLE',
        slot,
        index,
        patch: { table: pick.table, graphic: pick.graphic },
      });
      setResearchGraphic(graphicPreviewFor(pick));
      setResearchNav(navFor(slot));
      setResearchDone('Refreshed the chart.');
      return 'Refreshed the chart with the latest Tako data.';
    },
    render: ({ status, args }) => renderResearch(`Refreshing chart on page ${args?.slot ?? '…'}`, status),
  });
}
