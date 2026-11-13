// Human-readable values for WhatsApp / SMS template variables.
// Templates are approved by Meta / DLT with a fixed variable order, so only the values change here:
// partners are shown by name and record ids are shortened instead of sending raw UUIDs.

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const text = (value: unknown) => (typeof value === 'string' || typeof value === 'number' ? String(value).trim() : '');

/**
 * Short reference for a record id: the first 13 characters of a UUID (the same suffix the readable
 * admin/website slugs end with, so staff can search by it). Non-UUID values are returned unchanged.
 */
export const shortRecordRef = (value: unknown) => {
  const raw = text(value);
  return UUID_PATTERN.test(raw) ? raw.slice(0, 13).toUpperCase() : raw;
};

/** "Business name (Owner name)", or whichever of the two exists. */
export const partnerDisplayName = (input: { businessName?: unknown; ownerName?: unknown }) => {
  const business = text(input.businessName);
  const owner = text(input.ownerName);
  if (business && owner && business.toLowerCase() !== owner.toLowerCase()) return `${business} (${owner})`;
  return business || owner;
};

/**
 * Value for a template variable. Payload snapshots keep the raw ids (logs, dedupe and retries rely on them);
 * the message shows the readable form.
 */
export const messageVariableValue = (variable: string, payload: Record<string, unknown>): unknown => {
  switch (variable) {
    case 'partnerId':
      return text(payload.partnerDisplayName)
        || text(payload.partnerName)
        || payload.partnerCode
        || shortRecordRef(payload.partnerUserId ?? payload.userId ?? payload.partnerId);
    case 'listingId':
      return text(payload.listingRef) || shortRecordRef(payload.listingId);
    case 'paymentId':
      return text(payload.paymentRef) || shortRecordRef(payload.paymentId);
    case 'subscriptionId':
      return shortRecordRef(payload.subscriptionId);
    default:
      return payload[variable];
  }
};
