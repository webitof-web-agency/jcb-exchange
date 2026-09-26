import { normalizePublicUploadUrl } from './publicUploadUrl';

const LOCAL_UPLOAD_PATH = /^\/uploads(?:\/|$)/i;
const DRIVE_HOSTS = new Set(['drive.google.com', 'drive.usercontent.google.com', 'docs.google.com']);

const decodePathSegment = (value: string) => {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
};

const isLikelyDriveFileId = (value: string) => /^[a-zA-Z0-9_-]{10,}$/.test(value);

const extractDriveFileId = (value: string) => {
  const trimmed = value.trim();
  if (!trimmed) return null;

  if (!/^https?:\/\//i.test(trimmed)) {
    return isLikelyDriveFileId(trimmed) ? trimmed : null;
  }

  try {
    const parsedUrl = new URL(trimmed);
    if (!DRIVE_HOSTS.has(parsedUrl.hostname.toLowerCase())) {
      return null;
    }

    const queryId = parsedUrl.searchParams.get('id');
    if (queryId && isLikelyDriveFileId(queryId)) {
      return queryId;
    }

    const pathMatch = parsedUrl.pathname.match(/\/file\/d\/([^/]+)/i);
    const pathId = pathMatch?.[1] ? decodePathSegment(pathMatch[1]) : '';
    return pathId && isLikelyDriveFileId(pathId) ? pathId : null;
  } catch {
    return null;
  }
};

const toRenderableDriveUrl = (value: string) => {
  const driveFileId = extractDriveFileId(value);
  return driveFileId ? `https://drive.google.com/uc?id=${encodeURIComponent(driveFileId)}` : null;
};

export type MediaUrlSource = {
  url?: unknown;
  fileUrl?: unknown;
  absoluteUrl?: unknown;
  driveUrl?: unknown;
  driveFileId?: unknown;
};

/**
 * Valid persisted public media URL.
 *
 * Accepted formats:
 *  1. Absolute remote https:// URLs (e.g. CDN / Google Drive view links).
 *  2. Local branding images served under /uploads/public/. Branding uploads
 *     are kept on the configured persistent application volume; legacy Drive
 *     URLs are accepted and restored locally during server startup.
 *
 * Plain /uploads/<anything-else> paths (legacy arbitrary uploads) are still
 * rejected to avoid accidental persistence of stale paths.
 */
export const normalizeRemoteMediaUrl = (value?: string | null): string | null => {
  const normalizedValue = normalizePublicUploadUrl(value);

  if (!normalizedValue) {
    return null;
  }

  // Accept server-local branding paths stored under /uploads/public/
  if (/^\/uploads\/public\//i.test(normalizedValue)) {
    return normalizedValue;
  }

  // Accept absolute remote URLs
  if (!/^https?:\/\//i.test(normalizedValue)) {
    return null;
  }

  try {
    const parsedUrl = new URL(normalizedValue);
    if (!parsedUrl.hostname || LOCAL_UPLOAD_PATH.test(parsedUrl.pathname)) {
      return null;
    }

    if (/^\/uploads\/public\//i.test(parsedUrl.pathname)) {
      return normalizedValue;
    }

    return toRenderableDriveUrl(normalizedValue) || normalizedValue;
  } catch {
    return null;
  }
};

/**
 * Resolves all persisted/upload response shapes used by listing media.
 * Older records and client payloads may expose the same asset as `url`,
 * `fileUrl`, `absoluteUrl`, or a Drive file id.
 */
export const getRenderableMediaUrl = (source: unknown): string | null => {
  if (typeof source === 'string') {
    return normalizeRemoteMediaUrl(source) || toRenderableDriveUrl(source);
  }

  if (!source || typeof source !== 'object') {
    return null;
  }

  const media = source as MediaUrlSource;
  const candidates = [media.url, media.fileUrl, media.absoluteUrl, media.driveUrl, media.driveFileId];

  for (const candidate of candidates) {
    if (typeof candidate !== 'string' || !candidate.trim()) {
      continue;
    }

    const normalizedUrl = normalizeRemoteMediaUrl(candidate);
    if (normalizedUrl) {
      return normalizedUrl;
    }

    const driveUrl = toRenderableDriveUrl(candidate);
    if (driveUrl) {
      return driveUrl;
    }
  }

  return null;
};

export const normalizeListingMedia = <T extends Record<string, unknown>>(media: unknown): Array<T & { url: string }> => {
  if (!Array.isArray(media)) {
    return [];
  }

  return media
    .map((item) => {
      if (!item || typeof item !== 'object') {
        return null;
      }

      const url = getRenderableMediaUrl(item);
      if (!url) {
        return null;
      }

      const normalizedItem = { ...(item as T), url } as T & { url: string };
      const itemType = (item as { type?: unknown }).type;
      return typeof itemType === 'string'
        ? { ...normalizedItem, type: itemType.trim().toUpperCase() }
        : normalizedItem;
    })
    .filter((item): item is T & { url: string } => item !== null);
};
