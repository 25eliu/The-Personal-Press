'use client';
import { createElement, useEffect, useRef, useState, type Dispatch, type RefObject } from 'react';
import { useCopilotAction, useCopilotReadable } from '@copilotkit/react-core';
import type { EditionAction, EditionState } from '@/lib/edition/state';
import type { TArticle } from '@/lib/schema';
import { validateArticlePatch, validatePage } from '@/lib/edition/validate';
import { hasRealContent } from '@/lib/agents/reporter';
import { streamEditSection } from '@/lib/stream/editClient';
import { sectionToContext } from '@/lib/edition/grounding';
import { streamAskTako } from '@/lib/stream/askClient';
import type { AskSource } from '@/lib/stream/askEvents';
import { ResearchProgress } from '@/components/copilot/ResearchProgress';

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
) {
  // Always-current snapshot so action handlers never close over stale state.
  // Updated in an effect (not during render) so the ref is committed, not torn.
  // Action handlers fire from chat interactions long after effects flush.
  const stateRef = useRef(state);
  useEffect(() => {
    stateRef.current = state;
  });

  // Shared live state for whichever research action is currently running: the tool
  // log, the specific outlets being sourced, the streaming answer prose, and a
  // terminal status line. Only one research action runs at a time.
  const [researchLines, setResearchLines] = useState<string[]>([]);
  const [researchSources, setResearchSources] = useState<string[]>([]);
  const [researchAnswer, setResearchAnswer] = useState('');
  const [researchDone, setResearchDone] = useState<string | null>(null);

  // Reset every research surface before a new action streams into it.
  const resetResearch = () => {
    setResearchLines([]);
    setResearchSources([]);
    setResearchAnswer('');
    setResearchDone(null);
  };

  // Merge newly-discovered source labels, deduped case-insensitively, order-preserving.
  const mergeSources = (incoming: string[]) =>
    setResearchSources((prev) => {
      const seen = new Set(prev.map((s) => s.toLowerCase()));
      const next = [...prev];
      for (const s of incoming) {
        if (seen.has(s.toLowerCase())) continue;
        seen.add(s.toLowerCase());
        next.push(s);
      }
      return next;
    });

  const getArticle = (slot: number, index: number): TArticle | undefined =>
    stateRef.current.pages[slot]?.articles[index];

  const editSignal = () => abortRef.current?.signal;

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
              hasChart: Boolean(a.chartImageUrl),
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
      dispatch({ type: 'EDIT_ARTICLE', slot, index, patch });
      return `Updated “${result.article.headline}”.`;
    },
    render: ({ status, args }) =>
      createElement(ResearchProgress, {
        title: 'Editing article',
        lines: args?.headline ? [`New headline: “${args.headline}”`] : ['Rewriting…'],
        done: status === 'complete' ? 'Updated.' : undefined,
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
      resetResearch();
      let answer = '';
      let citations: AskSource[] = [];
      try {
        await streamAskTako(
          query,
          (e) => {
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
          editSignal(),
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
    render: ({ status, args }) =>
      createElement(ResearchProgress, {
        title: `Asking Tako: ${args?.query ?? '…'}`,
        lines: researchLines,
        sources: researchSources,
        answer: researchAnswer,
        done: status === 'complete' ? researchDone ?? 'Done.' : undefined,
      }),
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
      dispatch({ type: 'ADD_SECTION', page: v.page, position });
      setResearchDone(`Added “${v.page.topic}”.`);
      return `Added a new section: “${v.page.topic}”.`;
    },
    render: ({ status, args }) =>
      createElement(ResearchProgress, {
        title: `Researching: ${args?.topic ?? '…'}`,
        lines: researchLines,
        sources: researchSources,
        done: status === 'complete' ? researchDone ?? 'Done.' : undefined,
      }),
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
      const fresh = await runResearch(topic, slot === 0, sectionToContext(page));
      if (!fresh) return `No fresh reporting found for “${topic}”.`;
      const v = validatePage(fresh);
      if (!v.ok) return v.error;
      if (!hasRealContent(v.page)) return `No fresh reporting found for “${topic}”.`;
      dispatch({ type: 'REPLACE_PAGE', slot, page: v.page });
      setResearchDone(`Replaced “${page.topic}” → “${v.page.topic}”.`);
      return `Replaced the “${page.topic}” section with freshly-researched reporting: “${v.page.topic}”.`;
    },
    render: ({ status, args }) =>
      createElement(ResearchProgress, {
        title: `Re-researching: ${args?.topic ?? '…'}`,
        lines: researchLines,
        done: status === 'complete' ? researchDone ?? 'Done.' : undefined,
      }),
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
      const withChart = fresh.articles.find((a) => a.chartImageUrl);
      if (!withChart?.chartImageUrl) return 'No fresh chart available for that topic.';
      dispatch({
        type: 'EDIT_ARTICLE',
        slot,
        index,
        patch: { chartImageUrl: withChart.chartImageUrl, chartEmbedUrl: withChart.chartEmbedUrl },
      });
      setResearchDone('Refreshed the chart.');
      return 'Refreshed the chart with the latest Tako data.';
    },
    render: ({ status, args }) =>
      createElement(ResearchProgress, {
        title: `Refreshing chart on page ${args?.slot ?? '…'}`,
        lines: researchLines,
        sources: researchSources,
        done: status === 'complete' ? researchDone ?? 'Done.' : undefined,
      }),
  });
}
