import { expect, test } from 'vitest';
import { buildGraphic, graphicPatchFromJson, pickGraphic, summarizeGraphic, validateGraphic } from '@/lib/newspaper/graphic';
import { detectColumnUnit } from '@/lib/newspaper/tableShape';
import type { TTableData } from '@/lib/schema';

const t = (columns: string[], rows: string[][], caption = 'x'): TTableData => ({ caption, columns, rows });

// --- pickGraphic: auto-routing by data shape ------------------------------------------

test('routes a dated time series to a chart (line/area)', () => {
  const g = pickGraphic(t(['Year', 'GDP'], [['2022', '2.1'], ['2023', '2.5'], ['2024', '2.8']]))!;
  expect(g.kind).toBe('chart');
  if (g.kind === 'chart') expect(g.labelColumn).toBe('Year');
});

test('routes a non-dated single-metric comparison to a bar chart', () => {
  const g = pickGraphic(t(['Region', 'Revenue'], [['North', '4'], ['South', '3'], ['West', '5']]))!;
  expect(g.kind).toBe('chart');
  if (g.kind === 'chart') expect(g.type).toBe('bar');
});

test('routes a single row to a stat', () => {
  const g = pickGraphic(t(['Metric', 'Value'], [['US Inflation', '3.2%']]))!;
  expect(g.kind).toBe('stat');
});

test('routes a ranked multi-stat table to standings', () => {
  const g = pickGraphic(
    t(['Team', 'P', 'W', 'Pts'], [['Brazil', '5', '4', '13'], ['France', '5', '4', '12'], ['Japan', '5', '2', '7']]),
  )!;
  expect(g.kind).toBe('standings');
  if (g.kind === 'standings') {
    expect(g.entityColumn).toBe('Team');
    expect(g.statColumns).toContain('Pts');
  }
});

test('routes share-like categories that sum to ~100 to composition', () => {
  const g = pickGraphic(t(['Party', 'Share'], [['A', '45'], ['B', '35'], ['C', '20']]))!;
  expect(g.kind).toBe('composition');
});

test('routes a date+text fixtures list to a schedule', () => {
  const g = pickGraphic(
    t(['Date', 'Match', 'Venue'], [['Sat', 'Brazil v France', 'Rio'], ['Sun', 'Japan v Spain', 'Tokyo']]),
  )!;
  expect(g.kind).toBe('schedule');
  if (g.kind === 'schedule') expect(g.whenColumn).toBe('Date');
});

test('routes a pure two-numeric cloud to scatter', () => {
  const g = pickGraphic(t(['GDP', 'Life'], [['1', '60'], ['2', '65'], ['3', '70'], ['4', '74']]))!;
  expect(g.kind).toBe('scatter');
});

test('returns undefined when nothing can be drawn (all text, no dates)', () => {
  expect(pickGraphic(t(['A', 'B'], [['x', 'y'], ['p', 'q']]))).toBeUndefined();
});

test('does NOT route prediction-market questions into a schedule — falls back to table', () => {
  // The Polymarket regression: a date column + repeated long question titles is not a schedule.
  const g = pickGraphic(
    t(
      ['Date', 'Market', 'Outcome'],
      [
        ['2026-06-23 18:00:00+00:00', 'Will OpenAI hit $1.5T by June 30?', '12%'],
        ['2026-06-23 18:00:00+00:00', 'Will OpenAI hit $900B by June 30?', '44%'],
      ],
    ),
  );
  expect(g).toBeUndefined(); // → article shows its DataTable
});

test('does NOT make a stat from a single row of prose', () => {
  expect(pickGraphic(t(['Headline', 'n'], [['Will OpenAI list before 2027 and how the market reads it?', '1']]))).toBeUndefined();
});

test('still routes a clean fixtures table (date + short, varied titles) to a schedule', () => {
  const g = pickGraphic(
    t(['Date', 'Match'], [['2026-06-23', 'Brazil v France'], ['2026-06-24', 'Japan v Spain'], ['2026-06-25', 'USA v Mexico']]),
  )!;
  expect(g.kind).toBe('schedule');
});

test('a long date-indexed probability series is a chart, not a 25-row schedule', () => {
  // The ceasefire regression: a daily series rendered as an overflowing ScheduleCard.
  const rows = Array.from({ length: 25 }, (_, i) => [`2026-05-${14 + i}`, `${(0.2 + i * 0.01).toFixed(4)}`]);
  const g = pickGraphic(t(['Date', 'Probability'], rows))!;
  expect(g.kind).toBe('chart'); // dense date series → line/area, never a schedule
});

test('a schedule with too many rows falls through (not a schedule)', () => {
  const rows = Array.from({ length: 20 }, (_, i) => [`2026-06-${1 + i}`, `Event ${i}`]);
  const g = pickGraphic(t(['Date', 'Event'], rows));
  expect(g?.kind).not.toBe('schedule'); // 20 text rows is not a short event list
});

// --- buildGraphic: explicit kind (the copilot override) -------------------------------

test('buildGraphic forces standings even from a sparse Team+Points table', () => {
  const g = buildGraphic('standings', t(['Team', 'Points'], [['Brazil', '7'], ['France', '6'], ['Japan', '4']]))!;
  expect(g.kind).toBe('standings');
  if (g.kind === 'standings') expect(g.statColumns).toEqual(['Points']);
});

test('buildGraphic refuses a schedule when the table has no time/date column', () => {
  // The FIFA regression: "make the score chart a schedule" must NOT fabricate a schedule
  // from team-name columns — it returns undefined so the action fails honestly.
  expect(
    buildGraphic('schedule', t(['Team', 'Goals'], [['Brazil', '3'], ['France', '1'], ['Japan', '2']])),
  ).toBeUndefined();
});

test('buildGraphic still builds a schedule from a table with a real date column', () => {
  const g = buildGraphic(
    'schedule',
    t(['Date', 'Match'], [['2026-06-23', 'Brazil v France'], ['2026-06-24', 'Japan v Spain']]),
  )!;
  expect(g.kind).toBe('schedule');
  if (g.kind === 'schedule') {
    expect(g.whenColumn).toBe('Date');
    expect(g.titleColumn).toBe('Match');
  }
});

test('honors an explicit whenColumn hint even if auto-detection would miss it', () => {
  const g = buildGraphic(
    'schedule',
    t(['Kickoff', 'Match'], [['Sat 14:00', 'Brazil v France'], ['Sun 16:00', 'Japan v Spain']]),
    { whenColumn: 'Kickoff' },
  )!;
  expect(g.kind).toBe('schedule');
  if (g.kind === 'schedule') expect(g.whenColumn).toBe('Kickoff');
});

test('buildGraphic honors an explicit chart sub-type and columns', () => {
  const g = buildGraphic('chart', t(['Year', 'GDP', 'CPI'], [['2022', '2', '8'], ['2023', '3', '4']]), {
    type: 'line',
    valueColumns: ['CPI'],
  })!;
  expect(g.kind).toBe('chart');
  if (g.kind === 'chart') {
    expect(g.type).toBe('line');
    expect(g.valueColumns).toEqual(['CPI']);
  }
});

// --- validateGraphic: repair against the real columns ---------------------------------

test('validateGraphic repairs a graphic whose columns no longer exist', () => {
  const table = t(['Year', 'GDP'], [['2022', '2'], ['2023', '3']]);
  const g = validateGraphic({ kind: 'chart', type: 'bar', labelColumn: 'Nope', valueColumns: ['Gone'] }, table)!;
  expect(g.kind).toBe('chart');
  if (g.kind === 'chart') expect(table.columns).toContain(g.labelColumn);
});

// --- graphicPatchFromJson: the addChart boundary --------------------------------------

test('graphicPatchFromJson auto-picks from a JSON table', () => {
  const out = graphicPatchFromJson(
    JSON.stringify({ caption: 'Standings', columns: ['Team', 'GD', 'Pts'], rows: [['A', '12', '13'], ['B', '8', '12'], ['C', '3', '7']] }),
  );
  expect('error' in out).toBe(false);
  if ('error' in out) return;
  expect(out.graphic?.kind).toBe('standings');
});

test('graphicPatchFromJson honors a forced kind', () => {
  const out = graphicPatchFromJson(
    JSON.stringify({ caption: 'x', columns: ['Team', 'Pts'], rows: [['A', '7'], ['B', '6'], ['C', '4']] }),
    'standings',
  );
  expect('error' in out).toBe(false);
  if ('error' in out) return;
  expect(out.graphic?.kind).toBe('standings');
});

test('graphicPatchFromJson falls back to a table (no error) for messy data with no kind', () => {
  const out = graphicPatchFromJson(
    JSON.stringify({
      caption: 'OpenAI valuation markets',
      columns: ['Question', 'Probability'],
      rows: [['Will OpenAI hit $1.5T by June 30?', '12%'], ['Will OpenAI hit $900B by June 30?', '44%']],
    }),
  );
  expect('error' in out).toBe(false);
  if ('error' in out) return;
  expect(out.graphic).toBeUndefined(); // prose questions → table-only, never a broken graphic
  expect(out.table.rows.length).toBe(2);
});

test('graphicPatchFromJson rejects malformed JSON', () => {
  const out = graphicPatchFromJson('{ not json');
  expect('error' in out && out.error).toMatch(/valid JSON/);
});

test('graphicPatchFromJson rejects a table that fails the schema', () => {
  const out = graphicPatchFromJson(JSON.stringify({ caption: 'x', columns: ['A'] }));
  expect('error' in out).toBe(true);
});

// --- summarizeGraphic -----------------------------------------------------------------

test('detectColumnUnit reads only the column itself (a count carries no unit)', () => {
  const table = t(['Metric', 'Count', 'Value'], [['Transactions', '2', '$400']]);
  expect(detectColumnUnit(table, 'Count')).toBeUndefined(); // the "$2" regression
  expect(detectColumnUnit(table, 'Value')).toBe('$');
});

test('buildGraphic stat does not borrow a sibling money column unit', () => {
  const g = buildGraphic('stat', t(['Metric', 'Count'], [['Transactions', '2']]))!;
  expect(g.kind).toBe('stat');
  if (g.kind === 'stat') expect(g.unit).toBeUndefined();
});

test('summarizeGraphic reports the kind, label span and series ranges', () => {
  const table = t(['Year', 'GDP'], [['2022', '2.1'], ['2023', '2.5'], ['2024', '2.8']]);
  const g = pickGraphic(table)!;
  const s = summarizeGraphic(g, table);
  expect(s.kind).toBe('chart');
  expect(s.rowCount).toBe(3);
  expect(s.labelRange).toEqual({ first: '2022', last: '2024' });
  const gdp = s.series.find((x) => x.column === 'GDP')!;
  expect(gdp.max).toBe(2.8);
});
