import { expect, test } from 'vitest';
import { dedupeSources } from '@/lib/tako/sources';
import type { TSource } from '@/lib/schema';

test('dedupeSources removes duplicates by name+url, first seen wins', () => {
  const sources: TSource[] = [
    { name: 'BBC', url: 'https://bbc.com/x' },
    { name: 'BBC', url: 'https://bbc.com/x' }, // exact dupe
    { name: 'BBC', url: 'https://bbc.com/y' }, // same name, different url — kept
    { name: 'Reuters' },                       // no url
    { name: 'Reuters' },                       // dupe (no url)
  ];
  expect(dedupeSources(sources)).toEqual([
    { name: 'BBC', url: 'https://bbc.com/x' },
    { name: 'BBC', url: 'https://bbc.com/y' },
    { name: 'Reuters' },
  ]);
});

test('dedupeSources caps the list', () => {
  const sources: TSource[] = Array.from({ length: 10 }, (_, i) => ({ name: `S${i}` }));
  expect(dedupeSources(sources, 3)).toHaveLength(3);
});
