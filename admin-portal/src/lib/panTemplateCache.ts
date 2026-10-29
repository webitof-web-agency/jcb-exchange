type BlobLoader = () => Promise<Blob>;
const MAX_CACHED_TEMPLATES = 10;
const CACHE_TTL_MS = 5 * 60 * 1000;
const PERSISTENT_LOOKUP_TIMEOUT_MS = 1_500;
const PERSISTENT_CACHE_NAME = 'jcb-verification-template-cache';
const PERSISTENT_CACHE_VERSION = 1;
const PERSISTENT_CACHE_STORE = 'templates';

const blobCache = new Map<string, { blob: Blob; expiresAt: number }>();
const pendingLoads = new Map<string, Promise<Blob>>();
let persistentDbPromise: Promise<IDBDatabase | null> | null = null;

type PersistentTemplate = {
  key: string;
  blob: Blob;
  expiresAt: number;
  lastAccessedAt: number;
};

const openPersistentCache = (): Promise<IDBDatabase | null> => {
  if (typeof window === 'undefined' || !('indexedDB' in window)) return Promise.resolve(null);
  if (persistentDbPromise) return persistentDbPromise;

  persistentDbPromise = new Promise((resolve) => {
    const request = window.indexedDB.open(PERSISTENT_CACHE_NAME, PERSISTENT_CACHE_VERSION);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(PERSISTENT_CACHE_STORE)) {
        request.result.createObjectStore(PERSISTENT_CACHE_STORE, { keyPath: 'key' });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => resolve(null);
    request.onblocked = () => resolve(null);
  });

  return persistentDbPromise;
};

const readPersistentTemplate = async (key: string): Promise<Blob | null> => {
  const db = await openPersistentCache();
  if (!db) return null;

  return new Promise((resolve) => {
    const transaction = db.transaction(PERSISTENT_CACHE_STORE, 'readwrite');
    const store = transaction.objectStore(PERSISTENT_CACHE_STORE);
    const request = store.get(key);
    request.onsuccess = () => {
      const entry = request.result as PersistentTemplate | undefined;
      if (!entry || !(entry.blob instanceof Blob) || entry.expiresAt <= Date.now()) {
        if (entry) store.delete(key);
        resolve(null);
        return;
      }
      store.put({ ...entry, lastAccessedAt: Date.now() });
      resolve(entry.blob);
    };
    request.onerror = () => resolve(null);
  });
};

const persistTemplate = async (key: string, blob: Blob) => {
  if (blob.size > 5 * 1024 * 1024) return;
  const db = await openPersistentCache();
  if (!db) return;

  await new Promise<void>((resolve) => {
    const transaction = db.transaction(PERSISTENT_CACHE_STORE, 'readwrite');
    transaction.objectStore(PERSISTENT_CACHE_STORE).put({
      key,
      blob,
      expiresAt: Date.now() + CACHE_TTL_MS,
      lastAccessedAt: Date.now(),
    } satisfies PersistentTemplate);
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => resolve();
    transaction.onabort = () => resolve();
  });

  // Keep the persistent cache bounded even when users open many history records.
  await new Promise<void>((resolve) => {
    const transaction = db.transaction(PERSISTENT_CACHE_STORE, 'readwrite');
    const store = transaction.objectStore(PERSISTENT_CACHE_STORE);
    const request = store.getAll();
    request.onsuccess = () => {
      const entries = (request.result as PersistentTemplate[])
        .filter((entry) => entry.expiresAt > Date.now())
        .sort((left, right) => right.lastAccessedAt - left.lastAccessedAt);
      entries.slice(MAX_CACHED_TEMPLATES).forEach((entry) => store.delete(entry.key));
      resolve();
    };
    request.onerror = () => resolve();
    transaction.onabort = () => resolve();
  });
};

const storeInMemory = (key: string, blob: Blob) => {
  blobCache.set(key, { blob, expiresAt: Date.now() + CACHE_TTL_MS });
  while (blobCache.size > MAX_CACHED_TEMPLATES) {
    const oldestKey = blobCache.keys().next().value;
    if (!oldestKey) break;
    blobCache.delete(oldestKey);
  }
};

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

  const request = (async () => {
    const persistedBlob = await Promise.race([
      readPersistentTemplate(key).catch(() => null),
      new Promise<Blob | null>((resolve) => window.setTimeout(() => resolve(null), PERSISTENT_LOOKUP_TIMEOUT_MS)),
    ]);
    if (persistedBlob) {
      storeInMemory(key, persistedBlob);
      return persistedBlob;
    }
    const blob = await loader();
    storeInMemory(key, blob);
    void persistTemplate(key, blob);
    return blob;
  })()
    .finally(() => {
      pendingLoads.delete(key);
    });

  pendingLoads.set(key, request);
  return request;
};

export const clearPanTemplateBlob = (key: string) => {
  blobCache.delete(key);
  void openPersistentCache().then((db) => {
    if (!db) return;
    const transaction = db.transaction(PERSISTENT_CACHE_STORE, 'readwrite');
    transaction.objectStore(PERSISTENT_CACHE_STORE).delete(key);
  });
};

export const primePanTemplateBlob = (key: string, blob: Blob) => {
  storeInMemory(key, blob);
  void persistTemplate(key, blob);
};

// Shared bounded in-memory cache for other verification templates. The PAN
// export remains for backward compatibility with existing imports.
export const getVerificationTemplateBlob = getPanTemplateBlob;
export const primeVerificationTemplateBlob = primePanTemplateBlob;
