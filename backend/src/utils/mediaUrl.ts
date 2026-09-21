const LOCAL_UPLOAD_PATH = /^\/uploads(?:\/|$)/i;

/**
 * Only absolute remote media URLs are valid for persisted public media.
 * Relative /uploads paths belong to the old local-disk storage and are not
 * portable across VPS/database restores, so they must not be rendered or
 * accepted for new records.
 */
export const normalizeRemoteMediaUrl = (value?: string | null): string | null => {
  const normalizedValue = value?.trim();

  if (!normalizedValue || !/^https?:\/\//i.test(normalizedValue)) {
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
