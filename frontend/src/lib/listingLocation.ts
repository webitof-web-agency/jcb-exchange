type ListingLocationLike = {
  address?: string | null;
  pinCode?: string | null;
  locationCity?: string | null;
  locationState?: string | null;
};

type FormatListingLocationOptions = {
  includeAddress?: boolean;
  fallback?: string;
};

export const formatListingLocation = (
  listing: ListingLocationLike,
  options: FormatListingLocationOptions = {}
) => {
  const { includeAddress = false, fallback = '' } = options;
  const address = String(listing.address || '').trim();
  const pinCode = String(listing.pinCode || '').trim();
  const addressWithoutPinCode = address && pinCode
    ? address
      .replace(new RegExp(`\\s*(?:,|-)\\s*${pinCode.replace(/[.*+?^${}()|[\\]\\]/g, '\\$&')}\\s*$`, 'i'), '')
      .replace(new RegExp(`\\s+${pinCode.replace(/[.*+?^${}()|[\\]\\]/g, '\\$&')}\\s*$`, 'i'), '')
      .replace(/[\\s,-]+$/, '')
      .trim()
    : address;
  const parts = includeAddress
    ? [addressWithoutPinCode, listing.locationCity, listing.locationState]
    : [listing.locationCity, listing.locationState];
  const label = parts
    .map((value) => value?.trim())
    .filter(Boolean)
    .join(', ');

  return label || fallback;
};
