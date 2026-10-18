// Page-numbered lists shown with a "load more" button (groups, library
// categories). No imports: node tests load this file directly.

/** The backend caps page_size at this value (landa-backend utils/query-helpers.ts MAX_PAGE_SIZE). */
export const MAX_API_PAGE_SIZE = 100;

/**
 * Next page to request, or undefined when every row is loaded. An empty page
 * also ends the list, so a total that changed meanwhile cannot loop.
 */
export function nextPageNumber(pages: ReadonlyArray<{ rows: number }>, total: number): number | undefined {
  const last = pages[pages.length - 1];
  if (!last || last.rows === 0) return undefined;
  const loaded = pages.reduce((sum, page) => sum + page.rows, 0);
  return loaded < total ? pages.length + 1 : undefined;
}
