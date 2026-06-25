import { expect, test } from 'vitest';
import { normalizeCardSources, normalizeWebResult, sourceIndexLabel, validUrl } from '@/lib/tako/normalize';

test('validUrl strips empty and invalid', () => {
  expect(validUrl('')).toBeUndefined();
  expect(validUrl(null)).toBeUndefined();
  expect(validUrl('not a url')).toBeUndefined();
  expect(validUrl('https://trytako.com/x')).toBe('https://trytako.com/x');
});

test('sourceIndexLabel handles string and object', () => {
  expect(sourceIndexLabel('tako')).toBe('tako');
  expect(sourceIndexLabel({ index_type: 'web', segment_id: 's' })).toBe('web');
  expect(sourceIndexLabel(undefined)).toBe('tako');
});

test('normalizeCardSources falls back to webpage_url when source url empty', () => {
  const card = {
    title: 'Fed Funds Rate',
    webpage_url: 'https://trytako.com/card/abc/',
    sources: [{ source_name: 'St. Louis Fed', source_description: null, source_index: 'tako', url: '' }],
  } as any;
  const out = normalizeCardSources(card);
  expect(out).toEqual([{ name: 'St. Louis Fed', url: 'https://trytako.com/card/abc/' }]);
});

test('normalizeCardSources synthesizes a source when none usable', () => {
  const card = { title: 'Chart X', webpage_url: 'https://trytako.com/card/zzz/', sources: [] } as any;
  expect(normalizeCardSources(card)).toEqual([{ name: 'Chart X', url: 'https://trytako.com/card/zzz/' }]);
});

test('normalizeWebResult maps name and url', () => {
  const w = { title: 'BBC story', url: 'https://bbc.com/x', source_name: 'BBC' } as any;
  expect(normalizeWebResult(w)).toEqual({ name: 'BBC', url: 'https://bbc.com/x' });
});
