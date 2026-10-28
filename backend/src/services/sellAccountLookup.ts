export const buildSellAccountLookup = (identifier: string) => ({
  OR: [
    { id: identifier },
    { recordNumber: identifier },
    { listingId: identifier },
  ],
  deletedAt: null,
});
