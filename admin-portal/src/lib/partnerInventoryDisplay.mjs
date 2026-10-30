const positiveIntegerOrNull = (value) => {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? Math.floor(number) : null;
};

export const getPartnerInventoryDisplay = ({ listingCount }) => {
  const normalizedListingCount = positiveIntegerOrNull(listingCount) || 0;

  return {
    listingCount: normalizedListingCount,
    listingLimit: null,
    percentage: null,
    hasLimit: false,
  };
};
