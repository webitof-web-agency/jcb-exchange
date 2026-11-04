export const MODERATED_LISTING_STATUSES = Object.freeze(['UNLISTED', 'SUSPENDED', 'BLOCKED']);

export const shouldSyncListingAvailability = (listingStatus, requestedAvailability) => {
  if (!['AVAILABLE', 'SOLD'].includes(String(requestedAvailability || '').toUpperCase())) return false;

  const normalizedListingStatus = String(listingStatus || '').toUpperCase();
  return !MODERATED_LISTING_STATUSES.includes(normalizedListingStatus);
};
