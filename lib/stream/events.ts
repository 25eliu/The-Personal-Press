import type { TNewspaper, TPage } from '@/lib/schema';

export type SectionPlanItem = { topic: string; slot: number };

export type GenerateEvent =
  | {
      type: 'editor_done';
      masthead: string;
      tagline: string;
      edition: string;
      dateLine: string;
      plan: SectionPlanItem[];
    }
  | { type: 'section_started'; slot: number; topic: string }
  | { type: 'section_done'; slot: number; page: TPage }
  | { type: 'error'; slot?: number; message: string }
  | { type: 'complete'; newspaper: TNewspaper };
