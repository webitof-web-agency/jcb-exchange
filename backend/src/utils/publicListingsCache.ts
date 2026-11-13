// Short-lived cache for the public marketplace feed. The feed is the same for every visitor, and building it
// (DB read + JSON for every published listing) blocks the single Node thread; under load that froze every API
// request. One build per key per TTL is shared by all concurrent requests, and a gzip copy is kept so large
// feeds are not re-compressed per request.
import { gzip } from 'node:zlib';
import { promisify } from 'node:util';

const gzipAsync = promisify(gzip);
const TTL_MS = Number(process.env.PUBLIC_FEED_CACHE_MS || 30_000);

export type CachedFeed<T> = { items: T[]; json: Buffer; gzip: Buffer; builtAt: number };

const cache = new Map<string, CachedFeed<unknown>>();
const inFlight = new Map<string, Promise<CachedFeed<unknown>>>();
let generation = 0;

export const getCachedPublicFeed = async <T>(key: string, build: () => Promise<T[]>): Promise<CachedFeed<T>> => {
  const hit = cache.get(key);
  if (hit && Date.now() - hit.builtAt < TTL_MS) return hit as CachedFeed<T>;
  const pending = inFlight.get(key);
  if (pending) return pending as Promise<CachedFeed<T>>;

  const startedGeneration = generation;
  const promise = (async () => {
    const items = await build();
    const json = Buffer.from(JSON.stringify({ success: true, data: items }));
    const entry: CachedFeed<T> = { items, json, gzip: await gzipAsync(json), builtAt: Date.now() };
    // A clear() during the build means the data may already be stale: serve it once, do not keep it.
    if (startedGeneration === generation) cache.set(key, entry as CachedFeed<unknown>);
    return entry;
  })();
  inFlight.set(key, promise as Promise<CachedFeed<unknown>>);
  try {
    return await promise;
  } finally {
    inFlight.delete(key);
  }
};

/** Call after anything that changes which listings are public or how they look. */
export const clearPublicListingsCache = () => {
  generation += 1;
  cache.clear();
};
