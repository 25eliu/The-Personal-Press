import { expect, test } from 'vitest';
import { toolDetail, toolLabel } from '@/lib/tako/labels';

test('toolLabel maps the three Tako tools to friendly labels', () => {
  expect(toolLabel('tako_search')).toBe('Using Tako search');
  expect(toolLabel('tako_answer')).toBe('Asking Tako');
  expect(toolLabel('tako_contents')).toBe('Reading Tako data');
});

test('toolLabel humanizes unknown tool names', () => {
  expect(toolLabel('some_other_tool')).toBe('Using some other tool');
});

test('toolDetail reads query or url, ignores everything else', () => {
  expect(toolDetail({ query: 'Fed interest rate' })).toBe('Fed interest rate');
  expect(toolDetail({ url: 'https://trytako.com/card/x' })).toBe('https://trytako.com/card/x');
  expect(toolDetail({ other: 'x' })).toBeUndefined();
  expect(toolDetail(undefined)).toBeUndefined();
  expect(toolDetail({ query: '   ' })).toBeUndefined();
});
