const PARTNER_TYPE_LABELS: Record<string, string> = {
  SHOWROOM: 'Authorized Place',
  DEALER: 'Authorized Place',
  BROKER: 'Broker',
};

const toTitleCase = (value: string) =>
  value
    .toLowerCase()
    .split('_')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');

export const formatPartnerTypeLabel = (
  value?: string | null,
  fallback = 'Partner',
) => {
  if (!value) {
    return fallback;
  }

  return PARTNER_TYPE_LABELS[value] || toTitleCase(value);
};
