type OperatorAnswerInput = {
  message: string;
  toolName: string;
  operatorData: unknown;
};

const record = (value: unknown): Record<string, unknown> => (
  value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}
);

const text = (value: unknown) => typeof value === 'string' && value.trim() ? value.trim() : null;

/**
 * Answers narrow identity questions from the authenticated portal-only detail
 * projection. This keeps raw operational names out of the external provider
 * while still making the answer useful to the authorized operator.
 */
export const buildSoldVehicleOperatorAnswer = ({ message, toolName, operatorData }: OperatorAnswerInput): string | null => {
  if (toolName !== 'sold.vehicle.detail') return null;
  const normalized = message.toLocaleLowerCase('en-IN');
  const root = record(operatorData);
  const parties = record(root.parties);
  const seller = record(parties.seller);
  const purchaser = record(parties.purchaser);
  const owner = record(parties.owner);
  if (/\b(?:seller|sellor|seller\s+name|seller\s+ka\s+naam|seller\s+naam)\b/u.test(normalized)) {
    return `Seller name: ${text(seller.name) || 'database me available nahi hai.'}`;
  }
  if (/\b(?:purchaser|buyer|buyer\s+name|buyer\s+ka\s+naam|customer\s+name)\b/u.test(normalized)) {
    return `Buyer/purchaser name: ${text(purchaser.name) || 'database me available nahi hai.'}`;
  }
  if (/\b(?:owner|owner\s+name|owner\s+ka\s+naam)\b/u.test(normalized)) {
    return `Owner name: ${text(owner.name) || 'database me available nahi hai.'}`;
  }
  return null;
};
