export const buildSellAccountListUrl = (basePath, sellAccountId) => {
  const params = new URLSearchParams();
  const target = String(sellAccountId ?? '').trim();
  if (target) params.set('highlightId', target);
  return `${basePath}${params.toString() ? `?${params.toString()}` : ''}`;
};

export const isHighlightedSellAccount = (record, highlightId) => {
  const target = String(highlightId ?? '').trim();
  if (!target) return false;
  return [record?.id, record?.recordNumber]
    .some((value) => String(value ?? '').trim() === target);
};
