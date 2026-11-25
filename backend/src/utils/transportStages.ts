/**
 * The delivery procedure. A shipment moves through these stages one at a time, in this order.
 * Legacy statuses are folded into the stage they stand for.
 */
export const TRANSPORT_STAGE_FLOW = ['BOOKED', 'OUT_FOR_DELIVERY', 'ON_THE_WAY', 'DELIVERED'] as const;

export type TransportStage = (typeof TRANSPORT_STAGE_FLOW)[number];

const STAGE_LABEL: Record<TransportStage, string> = {
  BOOKED: 'Pending Dispatch',
  ON_THE_WAY: 'On The Way',
  OUT_FOR_DELIVERY: 'Out For Delivery',
  DELIVERED: 'Delivered',
};

export const normalizeTransportStage = (status: string): TransportStage | 'CANCELLED' | null => {
  if (status === 'VEHICLE_ASSIGNED') return 'BOOKED';
  if (status === 'DISPATCHED') return 'ON_THE_WAY';
  if (status === 'CANCELLED') return 'CANCELLED';
  return (TRANSPORT_STAGE_FLOW as readonly string[]).includes(status) ? (status as TransportStage) : null;
};

/** The only stage a shipment may move to next, or null once it is delivered or cancelled. */
export const getNextTransportStage = (status: string): TransportStage | null => {
  const current = normalizeTransportStage(status);
  if (!current || current === 'CANCELLED') return null;
  return TRANSPORT_STAGE_FLOW[TRANSPORT_STAGE_FLOW.indexOf(current) + 1] ?? null;
};

/**
 * Returns an error message when the move is not allowed, otherwise null.
 * Staff may move a shipment to any stage, forward or back, to correct mistakes.
 * Only a move to the stage it is already in, or out of a cancelled shipment, is refused.
 */
export const validateTransportTransition = (from: string, to: string): string | null => {
  const current = normalizeTransportStage(from);
  if (current === 'CANCELLED') return 'This shipment is cancelled and its status cannot change.';
  if (to === 'CANCELLED') {
    return current === 'DELIVERED' ? 'A delivered shipment cannot be cancelled.' : null;
  }
  const target = normalizeTransportStage(to);
  if (!target || target === 'CANCELLED') return 'Choose a valid stage.';
  if (target === current) return `The shipment is already at ${STAGE_LABEL[target]}.`;
  return null;
};
