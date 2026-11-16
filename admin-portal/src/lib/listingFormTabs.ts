export type ListingFormTabKey = 'equipment' | 'rto' | 'media' | 'pricing' | 'sale';

export type ListingFormTab = {
  key: ListingFormTabKey;
  label: string;
  badge?: string;
  badgeColor?: 'complete' | 'pending' | 'sold';
};

export const getListingFormTabs = (
  currentAvailability: string,
  uploadedMediaCount: number,
  hasRequiredMedia: boolean,
): ListingFormTab[] => [
  { key: 'equipment', label: 'Equipment & Specs' },
  { key: 'rto', label: 'RTO Compliance' },
  {
    key: 'media',
    label: 'Media Uploads',
    badge: `${uploadedMediaCount}/14`,
    badgeColor: hasRequiredMedia ? 'complete' : 'pending',
  },
  { key: 'pricing', label: 'Price & Location' },
  ...(currentAvailability.toUpperCase() === 'SOLD'
    ? [{ key: 'sale' as const, label: 'Buyer & Sale', badge: 'SOLD', badgeColor: 'sold' as const }]
    : []),
];
