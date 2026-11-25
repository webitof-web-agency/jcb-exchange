/**
 * Small helpers for server-paged lists (office team, offers): the "x–y of total" label and keeping the page number
 * inside the range after the list shrank (somebody was transferred out, a filter changed).
 */

export type PageInfo = { page: number; limit: number; total: number; totalPages?: number };

/** "21–40 of 135"; "0 of 0" when empty. `shown` is how many rows this page actually has. */
export const describePageRange = (info: PageInfo, shown: number) => {
  if (!info.total || !shown) return `0 of ${info.total}`;
  const first = (info.page - 1) * info.limit + 1;
  const last = Math.min(first + shown - 1, info.total);
  return `${first}–${last} of ${info.total}`;
};

export const totalPagesOf = (info: PageInfo) => info.totalPages ?? Math.max(1, Math.ceil(info.total / Math.max(1, info.limit)));

/** The page to show when the current one no longer exists (null when it is fine). */
export const clampPage = (info: PageInfo): number | null => {
  const pages = totalPagesOf(info);
  if (info.page > pages) return pages;
  if (info.page < 1) return 1;
  return null;
};
