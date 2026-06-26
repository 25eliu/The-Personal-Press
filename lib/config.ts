export const MODEL = 'gpt-4.1';

/** The newspaper's fixed brand / masthead. */
export const BRAND = 'The Personal Press';

export const SOURCE_COUNTS = { tako: 5, web: 5 } as const;

export const MAX_PAGES = 5;        // front page + up to 4 topic pages
export const MAX_TABLE_ROWS = 50;  // cap rows distilled into a printed table

export const WORD_CAPS = { lead: 180, standard: 110, brief: 60 } as const;
