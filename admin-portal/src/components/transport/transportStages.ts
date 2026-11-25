/**
 * Transport stages shared by the list page, the detail page and the status modal,
 * so every screen shows the same order, labels and current stage.
 */
export type TransportStageKey = 'BOOKED' | 'OUT_FOR_DELIVERY' | 'ON_THE_WAY' | 'DELIVERED';

export const TRANSPORT_STAGES: { key: TransportStageKey; label: string }[] = [
  { key: 'BOOKED', label: 'Pending Dispatch' },
  { key: 'OUT_FOR_DELIVERY', label: 'Out For Delivery' },
  { key: 'ON_THE_WAY', label: 'On The Way' },
  { key: 'DELIVERED', label: 'Delivered' },
];

/** Folds legacy statuses into the stage they stand for. */
export const normalizeTransportStage = (status: string): string => {
  if (status === 'VEHICLE_ASSIGNED') return 'BOOKED';
  if (status === 'DISPATCHED') return 'ON_THE_WAY';
  return status;
};

/** Badge colours per stage, used by the list and the detail page so both look the same. */
export const transportStageTone = (status: string): string => {
  switch (normalizeTransportStage(status)) {
    case 'OUT_FOR_DELIVERY': return 'bg-purple-100 text-purple-800';
    case 'ON_THE_WAY': return 'bg-amber-100 text-amber-800';
    case 'DELIVERED': return 'bg-emerald-100 text-emerald-800';
    case 'CANCELLED': return 'bg-rose-100 text-rose-700';
    default: return 'bg-slate-100 text-slate-700';
  }
};

export const transportStageLabel = (status: string): string =>
  TRANSPORT_STAGES.find((stage) => stage.key === normalizeTransportStage(status))?.label
  ?? (status === 'CANCELLED' ? 'Cancelled' : status.replaceAll('_', ' '));
