/**
 * Build the compact page button sequence used across admin tables.
 * Example: [1, '...', 4, 5, 6, '...', 10]
 *
 * @param {number} currentPage
 * @param {number} totalPages
 * @returns {(number | '...')[]}
 */
export function buildPaginationItems(currentPage, totalPages) {
  if (totalPages <= 5) {
    return Array.from({ length: totalPages }, (_, index) => index + 1);
  }

  const safeCurrentPage = Math.max(1, Math.min(currentPage, totalPages));
  const visiblePages = new Set([1, totalPages]);

  for (let page = safeCurrentPage - 1; page <= safeCurrentPage + 1; page += 1) {
    if (page > 1 && page < totalPages) {
      visiblePages.add(page);
    }
  }

  return Array.from(visiblePages)
    .sort((a, b) => a - b)
    .reduce((items, page, index, pages) => {
      if (index > 0 && page - pages[index - 1] > 1) {
        items.push('...');
      }
      items.push(page);
      return items;
    }, /** @type {(number | '...')[]} */ ([]));
}
