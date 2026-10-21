export const buildListingListUrl = (basePath, listingId) => {
  const params = new URLSearchParams();
  const target = String(listingId ?? '').trim();
  if (target) params.set('highlightId', target);
  return `${basePath}${params.toString() ? `?${params.toString()}` : ''}`;
};

export const isHighlightedListing = (record, highlightId) => {
  const target = String(highlightId ?? '').trim();
  if (!target) return false;
  return String(record?.id ?? '').trim() === target;
};
