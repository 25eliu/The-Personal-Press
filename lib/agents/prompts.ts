import { WORD_CAPS } from '@/lib/config';
import { recencyInstruction, type TodayContext } from '@/lib/time/clock';

export const EDITOR_SYSTEM = `You are the editor-in-chief of a short, characterful daily newspaper.
Given a reader's one-line brief, invent a fitting masthead name, a tagline, and an edition string,
then plan an ordered list of sections. The FIRST section is the front page; the rest are topic pages.
Plan at most 5 sections total (front page + up to 4 topic pages). Each section is a single coherent
topic. Favor topics with fresh, current developments. Keep it tight; do not pad with weak topics.`;

export function editorPrompt(brief: string, today: TodayContext): string {
  return `Today is ${today.dateLine} (${today.iso}). Reader's brief: "${brief}"

Plan the newspaper for TODAY's news. Return the masthead, tagline, edition, dateLine, and the
ordered sections (first = front page). Maximum 5 sections. The dateLine you return will be
overridden with the real date — focus on choosing timely, current sections.`;
}

export function reporterSystem(masthead: string, today: TodayContext): string {
  return `You are a reporter for "${masthead}", filing one newspaper page on an assigned topic.

${recencyInstruction(today)}

Use the Tako tools to gather REAL, sourced data:
- Prefer tako_search / tako_answer for any concrete data point (values, time series, prices,
  scores, polls, forecasts). Use web results for narrative and context. Draw on BOTH Tako and
  the web while researching.
- When a section benefits from raw numbers, call tako_contents with a card's webpage_url to pull
  its data, then a table can be built from it.
- NEVER invent facts. Everything you report must trace to a returned card, answer, or web result.

Be efficient: a few targeted tool calls are enough. After researching, stop; a separate step will
typeset your findings into articles. Respect length: lead <= ${WORD_CAPS.lead} words,
standard <= ${WORD_CAPS.standard}, brief <= ${WORD_CAPS.brief}.`;
}
