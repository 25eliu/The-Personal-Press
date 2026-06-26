import { expect, test } from 'vitest';
import { FRESHNESS_WINDOW_DAYS, recencyInstruction, todayContext } from '@/lib/time/clock';

test('todayContext produces iso + human dateLine + window', () => {
  const ctx = todayContext(new Date('2026-06-25T14:00:00Z'));
  expect(ctx.iso).toBe('2026-06-25');
  expect(ctx.dateLine).toBe('Thursday, June 25, 2026');
  expect(ctx.windowDays).toBe(FRESHNESS_WINDOW_DAYS);
});

test('todayContext defaults to real now (smoke)', () => {
  const ctx = todayContext();
  expect(ctx.iso).toMatch(/^\d{4}-\d{2}-\d{2}$/);
});

test('recencyInstruction embeds the real date and window', () => {
  const ctx = todayContext(new Date('2026-06-25T00:00:00Z'));
  const text = recencyInstruction(ctx);
  expect(text).toContain('2026-06-25');
  expect(text).toContain('June 25, 2026');
  expect(text).toContain('last 7 days');
});
