type CacheEntry = {
  value: unknown;
  expiresAt: number;
};

// Keep provider responses only in the current browser session. Sensitive KYC data
// is deliberately not written to localStorage or any other durable browser store.
const verificationCache = new Map<string, CacheEntry>();
const DEFAULT_TTL_MS = 24 * 60 * 60 * 1000;

export const buildVerificationCacheKey = (operation: string, identifier: string) =>
  `${operation.trim().toLowerCase()}:${identifier.trim().toUpperCase().replace(/\s+/g, '')}`;

export function getVerificationCache<T>(key: string): T | null {
  const entry = verificationCache.get(key);
  if (!entry) return null;
  if (entry.expiresAt <= Date.now()) {
    verificationCache.delete(key);
    return null;
  }
  return entry.value as T;
}

export function setVerificationCache(key: string, value: unknown, ttlMs = DEFAULT_TTL_MS) {
  verificationCache.set(key, { value, expiresAt: Date.now() + ttlMs });
}

export function clearVerificationCache() {
  verificationCache.clear();
}
