import { normalizePublicUploadUrl } from './publicUploadUrl';

const LOCAL_UPLOAD_PATH = /^\/uploads(?:\/|$)/i;

/**
 * Valid persisted public media URL.
 *
 * Accepted formats:
 *  1. Absolute remote https:// URLs (e.g. CDN / Google Drive view links).
 *  2. Local server-stored branding images served under /uploads/public/
 *     (hero image, site logo, inspection/certification section). These are
 *     written to disk by the backend and served via the static /uploads/public
 *     route, so they are fully portable within the same VPS deployment.
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

    return normalizedValue;
  } catch {
    return null;
  }
};
