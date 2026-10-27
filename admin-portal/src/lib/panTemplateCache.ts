type BlobLoader = () => Promise<Blob>;
const MAX_CACHED_TEMPLATES = 10;
const CACHE_TTL_MS = 5 * 60 * 1000;

const blobCache = new Map<string, { blob: Blob; expiresAt: number }>();
const pendingLoads = new Map<string, Promise<Blob>>();

export const getPanTemplateBlob = (key: string, loader: BlobLoader) => {
  const cached = blobCache.get(key);
  if (cached && cached.expiresAt > Date.now()) {
    blobCache.delete(key);
    blobCache.set(key, cached);
    return Promise.resolve(cached.blob);
  }
  if (cached) blobCache.delete(key);

  const pending = pendingLoads.get(key);
  if (pending) return pending;

  const request = loader()
    .then((blob) => {
      blobCache.set(key, { blob, expiresAt: Date.now() + CACHE_TTL_MS });
      while (blobCache.size > MAX_CACHED_TEMPLATES) {
        const oldestKey = blobCache.keys().next().value;
        if (!oldestKey) break;
        blobCache.delete(oldestKey);
      }
      return blob;
    })
    .finally(() => {
      pendingLoads.delete(key);
    });

  pendingLoads.set(key, request);
  return request;
};

export const clearPanTemplateBlob = (key: string) => {
  blobCache.delete(key);
};

// Shared bounded in-memory cache for other verification templates. The PAN
// export remains for backward compatibility with existing imports.
export const getVerificationTemplateBlob = getPanTemplateBlob;
