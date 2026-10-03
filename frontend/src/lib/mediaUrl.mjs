import { getDriveMediaProxyPath, normalizePublicUploadUrl } from './publicUploadUrl.mjs';

export const resolveAbsoluteMediaUrl = (value, apiOrigin) => {
  const normalizedUrl = normalizePublicUploadUrl(value);
  if (!normalizedUrl) return '';

  if (/^\/?(?:api\/)?uploads(?:\/|$)/i.test(normalizedUrl) && !/^\/?(?:api\/)?uploads\/public\//i.test(normalizedUrl)) {
    return '';
  }

  const driveMediaProxyPath = getDriveMediaProxyPath(normalizedUrl);
  if (driveMediaProxyPath) {
    return `${apiOrigin}${driveMediaProxyPath}`;
  }

  if (/^https?:\/\//i.test(normalizedUrl)) {
    try {
      const pathname = new URL(normalizedUrl).pathname;
      if (/^\/uploads(?:\/|$)/i.test(pathname) && !/^\/uploads\/public\//i.test(pathname)) {
        return '';
      }
    } catch {
      return '';
    }

    return normalizedUrl;
  }

  return `${apiOrigin}${normalizedUrl.startsWith('/') ? '' : '/'}${normalizedUrl}`;
};
