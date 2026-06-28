export const MODEL = 'gpt-5.4-mini';

/** The newspaper's fixed brand / masthead. */
export const BRAND = 'The Personal Press';

export const SOURCE_COUNTS = { tako: 5, web: 5 } as const;

/** IANA timezone passed to Tako so "latest"/"today" resolve consistently with the
 *  clock's UTC-based dateLine. */
export const TIMEZONE = 'UTC';

export const MAX_PAGES = 5;        // front page + up to 4 topic pages
export const MAX_TABLE_ROWS = 50;  // cap rows distilled into a printed table

// Word budgets per article size. Set to fill two newspaper columns without padding; the
// paginator flows any overflow onto the next leaf, so fuller copy fills the page.
export const WORD_CAPS = { lead: 200, standard: 130, brief: 70 } as const;
