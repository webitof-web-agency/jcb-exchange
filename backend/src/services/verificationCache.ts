import crypto from 'node:crypto';

export const VERIFICATION_CACHE_TTL_HOURS = 24;
export const VERIFICATION_CACHE_TTL_MS = VERIFICATION_CACHE_TTL_HOURS * 60 * 60 * 1000;

const canonicalize = (value: unknown): unknown => {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, item]) => [key, canonicalize(item)]),
    );
  }
  return value;
};

export const createVerificationFingerprint = (namespace: string, payload: Record<string, unknown>) =>
  crypto.createHash('sha256')
    .update(JSON.stringify({ namespace, payload: canonicalize(payload) }))
    .digest('hex');

export const isFreshVerificationResult = (
  record: { status?: unknown; encryptedResult?: unknown; completedAt?: unknown },
  now = Date.now(),
) => {
  if (record.status !== 'SUCCESS' || typeof record.encryptedResult !== 'string' || !record.encryptedResult) return false;
  const completedAt = record.completedAt instanceof Date ? record.completedAt.getTime() : new Date(String(record.completedAt ?? '')).getTime();
  return Number.isFinite(completedAt) && completedAt >= now - VERIFICATION_CACHE_TTL_MS;
};
