export type PartnerInventorySnapshot = {
  publishedListings: number | null | undefined;
  listingLimit: number | null | undefined;
};

export type PartnerInventory = {
  listingCount: number;
  listingLimit: number | null;
};

export const normalizePartnerInventory = ({
  publishedListings,
  listingLimit,
}: PartnerInventorySnapshot): PartnerInventory => ({
  listingCount: Number.isFinite(publishedListings) && Number(publishedListings) > 0
    ? Math.floor(Number(publishedListings))
    : 0,
  listingLimit: Number.isFinite(listingLimit) && Number(listingLimit) > 0
    ? Math.floor(Number(listingLimit))
    : null,
});
