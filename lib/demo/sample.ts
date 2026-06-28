// Client-only sample edition: replays canned progress events (no network, no
// API keys) so the build animation, Tako wire-ticker, page-flip, and B&W toggle
// can be exercised and demoed without spending credits. The data here is a fixed
// fixture — it is clearly a sample, not live reporting.

import type { GenerateEvent } from '@/lib/stream/events';
import type { TNewspaper } from '@/lib/schema';

const SAMPLE: TNewspaper = {
  masthead: 'The Personal Press',
  tagline: 'A sample edition — sourced data, set in type',
  edition: 'Vol. I · Sample',
  dateLine: 'Sample Edition',
  pages: [
    {
      topic: 'Front Page',
      articles: [
        {
          kicker: 'Markets',
          headline: 'Indexes Drift as Traders Await the Fed',
          dek: 'A quiet session masks a tense week ahead',
          byline: 'Tako Wire',
          size: 'lead',
          body:
            'Equities edged sideways through the session as investors held fire before the central bank decision. ' +
            'Breadth was thin and volume light, with rate-sensitive sectors leading the few moves of note. ' +
            'Analysts framed the calm as a coiled spring rather than complacency.',
          table: {
            caption: 'S&P 500 — daily close',
            columns: ['Date', 'S&P 500'],
            rows: [
              ['Mon', '5280'],
              ['Tue', '5274'],
              ['Wed', '5291'],
              ['Thu', '5288'],
              ['Fri', '5302'],
            ],
          },
          graphic: { kind: 'chart', type: 'area', labelColumn: 'Date', valueColumns: ['S&P 500'] },
          sources: [
            { name: 'Federal Reserve Bank of St. Louis', url: 'https://fred.stlouisfed.org/' },
            { name: 'Reuters', url: 'https://www.reuters.com/' },
          ],
        },
        {
          kicker: 'Energy',
          headline: 'Crude Steadies Near Multi-Week Range',
          byline: 'Tako Wire',
          size: 'brief',
          body: 'Oil held a narrow band as supply signals offset soft demand reads from Asia.',
          sources: [{ name: 'EIA', url: 'https://www.eia.gov/' }],
        },
        {
          kicker: 'Tech',
          headline: 'Chipmakers Pace Pre-Decision Caution',
          byline: 'Tako Wire',
          size: 'brief',
          body: 'Semiconductor names slipped modestly, giving back a sliver of a strong monthly run.',
          sources: [{ name: 'Bloomberg', url: 'https://www.bloomberg.com/' }],
        },
      ],
    },
    {
      topic: 'The Fed',
      articles: [
        {
          kicker: 'Policy',
          headline: 'Rate Path Holds as Inflation Cools Slowly',
          byline: 'Tako Wire',
          size: 'standard',
          body:
            'Officials signalled patience, leaning on incoming data rather than pre-committing to cuts. ' +
            'The effective funds rate sat near recent levels, with markets pricing a gradual glide later in the year.',
          table: {
            caption: 'Effective federal funds rate',
            columns: ['Month', 'Rate'],
            rows: [
              ['Jan', '5.3'],
              ['Feb', '5.3'],
              ['Mar', '5.1'],
              ['Apr', '4.9'],
              ['May', '4.6'],
            ],
          },
          graphic: { kind: 'chart', type: 'line', labelColumn: 'Month', valueColumns: ['Rate'], unit: '%' },
          sources: [{ name: 'Federal Reserve', url: 'https://www.federalreserve.gov/' }],
        },
        {
          kicker: 'Outlook',
          headline: 'Economists Split on Timing of First Cut',
          byline: 'Tako Wire',
          size: 'brief',
          body: 'Forecasters diverged on whether easing arrives by autumn or slips into next year.',
          sources: [{ name: 'WSJ Survey', url: 'https://www.wsj.com/' }],
        },
      ],
    },
    {
      topic: 'Football',
      articles: [
        {
          kicker: 'Premier League',
          headline: 'Title Race Tightens at the Top',
          byline: 'Tako Wire',
          size: 'standard',
          body:
            'A weekend of upsets reshuffled the table, cutting the lead at the summit to a single point ' +
            'with a handful of fixtures left to play.',
          table: {
            caption: 'Premier League — top of the table',
            columns: ['Club', 'P', 'GD', 'Pts'],
            rows: [
              ['Arsenal', '36', '+48', '83'],
              ['Liverpool', '36', '+45', '82'],
              ['Manchester City', '36', '+50', '82'],
              ['Aston Villa', '36', '+19', '68'],
            ],
          },
          graphic: { kind: 'standings', entityColumn: 'Club', statColumns: ['P', 'GD', 'Pts'] },
          sources: [{ name: 'Premier League', url: 'https://www.premierleague.com/' }],
        },
        {
          kicker: 'Form',
          headline: 'Strikers Trade Blows in Golden Boot Chase',
          byline: 'Tako Wire',
          size: 'brief',
          body: 'Two front-runners stayed level on goals after another high-scoring round.',
          sources: [{ name: 'Opta', url: 'https://www.statsperform.com/opta/' }],
        },
      ],
    },
  ],
};

const PLAN = SAMPLE.pages.map((p, slot) => ({ topic: p.topic, slot }));

// Canned Tako tool calls per section, with friendly labels matching toolLabel().
const ACTIVITY: Record<number, { tool: string; label: string; detail: string }[]> = {
  0: [
    { tool: 'tako_search', label: 'Using Tako search', detail: 'S&P 500 close today' },
    { tool: 'tako_contents', label: 'Reading Tako data', detail: 'S&P 500 daily series' },
  ],
  1: [
    { tool: 'tako_search', label: 'Using Tako search', detail: 'effective federal funds rate' },
  ],
  2: [
    { tool: 'tako_search', label: 'Using Tako search', detail: 'Premier League standings' },
  ],
};

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Replay the sample edition as a stream of events. `stopped()` lets the caller abort. */
export async function playDemo(
  onEvent: (e: GenerateEvent) => void,
  stopped: () => boolean,
): Promise<void> {
  if (stopped()) return;
  onEvent({
    type: 'editor_done',
    masthead: SAMPLE.masthead, tagline: SAMPLE.tagline, edition: SAMPLE.edition, dateLine: SAMPLE.dateLine,
    plan: PLAN,
  });

  await Promise.all(
    PLAN.map(async ({ topic, slot }) => {
      await wait(300 + slot * 250);
      if (stopped()) return;
      onEvent({ type: 'section_started', slot, topic });
      for (const a of ACTIVITY[slot] ?? []) {
        await wait(650);
        if (stopped()) return;
        onEvent({ type: 'tool_activity', slot, topic, tool: a.tool, label: a.label, detail: a.detail });
      }
      await wait(500);
      if (stopped()) return;
      onEvent({ type: 'section_done', slot, page: SAMPLE.pages[slot] });
    }),
  );

  if (stopped()) return;
  onEvent({ type: 'complete', newspaper: SAMPLE });
}
