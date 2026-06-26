import { expect, test } from 'vitest';
import { reporterSystem, groundingBlock } from '@/lib/agents/prompts';
import { recencyInstruction, todayContext } from '@/lib/time/clock';

const today = todayContext(new Date('2026-06-25T00:00:00Z'));

test('recencyInstruction no longer tells the model to reframe every query as latest/today', () => {
  const s = recencyInstruction(today).toLowerCase();
  expect(s).not.toContain('frame every');           // the old topic-hijacking directive
  expect(s).toContain('2026');                        // still date-aware
});

test('reporterSystem anchors the model to the assigned topic', () => {
  const s = reporterSystem('The Personal Press', today).toLowerCase();
  expect(s).toContain('assigned topic');
  expect(s).toMatch(/stay (strictly )?on/);
});

test('groundingBlock is empty without context and includes the text with it', () => {
  expect(groundingBlock()).toBe('');
  expect(groundingBlock('Existing transfers article text')).toContain('EXISTING COVERAGE');
  expect(groundingBlock('Existing transfers article text')).toContain('Existing transfers article text');
});
