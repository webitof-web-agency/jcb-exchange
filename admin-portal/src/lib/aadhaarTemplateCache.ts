type BlobLoader = () => Promise<Blob>;

const MAX_CACHED_TEMPLATES = 10;
const CACHE_TTL_MS = 10 * 60 * 1000;

const blobCache = new Map<string, { blob: Blob; expiresAt: number }>();
const pendingLoads = new Map<string, Promise<Blob>>();

const remember = (key: string, blob: Blob) => {
  blobCache.set(key, { blob, expiresAt: Date.now() + CACHE_TTL_MS });
  while (blobCache.size > MAX_CACHED_TEMPLATES) {
    const oldestKey = blobCache.keys().next().value;
    if (!oldestKey) break;
    blobCache.delete(oldestKey);
  }
  return blob;
};

export const getAadhaarTemplateBlob = (key: string, loader: BlobLoader) => {
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
    .then((blob) => remember(key, blob))
    .finally(() => {
      pendingLoads.delete(key);
    });

  pendingLoads.set(key, request);
  return request;
};

export const rememberAadhaarTemplateBlob = (key: string, blob: Blob) => remember(key, blob);

export const clearAadhaarTemplateBlob = (key: string) => {
  blobCache.delete(key);
};
