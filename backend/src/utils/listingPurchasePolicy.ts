export const SELF_PURCHASE_NOT_ALLOWED_CODE = 'SELF_PURCHASE_NOT_ALLOWED';
export const SELF_PURCHASE_NOT_ALLOWED_MESSAGE =
  'You cannot buy your own listing.';

export const isSelfPurchase = (listingOwnerId?: string | null, buyerId?: string | null) =>
  Boolean(listingOwnerId && buyerId && listingOwnerId === buyerId);
