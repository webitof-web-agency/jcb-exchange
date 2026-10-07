type ListingNotificationTextInput = {
  title?: string | null | undefined;
  categoryName?: string | null | undefined;
  brandName?: string | null | undefined;
  modelName?: string | null | undefined;
  manufacturingYear?: number | string | null | undefined;
  price?: unknown;
  locationCity?: string | null | undefined;
  locationState?: string | null | undefined;
};

const cleanDisplayValue = (value: unknown) => {
  const normalized = String(value ?? '').trim();
  if (!normalized || normalized.toLowerCase() === 'not specified') return '';
  return normalized;
};

const formatListingPrice = (price: unknown) => {
  const numericPrice = Number(price);
  if (!Number.isFinite(numericPrice) || numericPrice <= 0) return '';
  return `Rs ${(numericPrice / 100000).toFixed(2)} Lakh`;
};

export const buildCustomerListingNotificationText = (input: ListingNotificationTextInput) => {
  const category = cleanDisplayValue(input.categoryName) || 'Vehicle';
  const listingTitle = cleanDisplayValue(input.title)
    || [input.manufacturingYear, input.brandName, input.modelName]
      .map(cleanDisplayValue)
      .filter(Boolean)
      .join(' ')
    || 'Vehicle';
  const location = [input.locationCity, input.locationState]
    .map(cleanDisplayValue)
    .filter(Boolean)
    .join(', ');
  const message = [formatListingPrice(input.price), location]
    .filter(Boolean)
    .join(' • ');

  return {
    title: `New ${category} listed: ${listingTitle}`,
    message: message || 'Tap to view listing details',
  };
};
