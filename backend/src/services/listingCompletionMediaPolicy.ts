export const LISTING_COMPLETION_MEDIA_SLOTS = [
  { key: 'front-view', label: 'Front View (Image)', kind: 'IMAGE' },
  { key: 'rear-view', label: 'Rear View (Image)', kind: 'IMAGE' },
  { key: 'left-side', label: 'Left Side (Image)', kind: 'IMAGE' },
  { key: 'right-side', label: 'Right Side (Image)', kind: 'IMAGE' },
  { key: 'front-left-angle', label: 'Front-Left Angle', kind: 'IMAGE' },
  { key: 'front-right-angle', label: 'Front-Right Angle', kind: 'IMAGE' },
  { key: 'rear-left-angle', label: 'Rear-Left Angle', kind: 'IMAGE' },
  { key: 'rear-right-angle', label: 'Rear-Right Angle', kind: 'IMAGE' },
  { key: 'chassis-number', label: 'Chassis Number', kind: 'IMAGE' },
  { key: 'meter-reading', label: 'Meter Reading', kind: 'IMAGE' },
  { key: 'dashboard-front', label: 'Dashboard Front', kind: 'IMAGE' },
  { key: 'dashboard-left', label: 'Dashboard Left', kind: 'IMAGE' },
  { key: 'dashboard-right', label: 'Dashboard Right', kind: 'IMAGE' },
  { key: 'walkaround-video', label: 'Video (Max 1)', kind: 'VIDEO' },
] as const;

export type ListingCompletionMediaSlot = typeof LISTING_COMPLETION_MEDIA_SLOTS[number]['key'];

export const isListingCompletionMediaSlot = (value: unknown): value is ListingCompletionMediaSlot =>
  typeof value === 'string' && LISTING_COMPLETION_MEDIA_SLOTS.some((slot) => slot.key === value);

export const getListingCompletionMediaSlot = (value: unknown) =>
  LISTING_COMPLETION_MEDIA_SLOTS.find((slot) => slot.key === value) || null;
