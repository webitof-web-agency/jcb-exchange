const SECURE_DRIVE_PREFIX = 'drive-';

const decodePathSegment = (value: string) => {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
};

export const getSecureDocumentUrl = (driveFileId: string) => {
  const normalizedId = driveFileId.trim();
  if (!normalizedId) {
    throw new Error('A Drive file id is required for a secure document URL.');
  }

  return getSecureDocumentUrlFromToken(`${SECURE_DRIVE_PREFIX}${encodeURIComponent(normalizedId)}`);
};

export const getSecureDocumentUrlFromToken = (token: string) =>
  `/api/documents/secure/${encodeURIComponent(token.trim())}`;

export const extractDriveFileIdFromSecureUrl = (url: string | null | undefined): string | null => {
  if (!url) return null;

  const trimmed = url.trim();
  if (!trimmed) return null;

  if (/^https?:\/\//i.test(trimmed)) {
    try {
      const parsed = new URL(trimmed);
      const directId = parsed.searchParams.get('id');
      if (directId) return directId;

      const pathMatch = parsed.pathname.match(/\/file\/d\/([^/]+)/i);
      if (pathMatch?.[1]) return decodePathSegment(pathMatch[1]);

      const securePathMatch = parsed.pathname.match(/\/secure\/(drive-[^/]+)/i);
      if (securePathMatch?.[1]) {
        return decodePathSegment(securePathMatch[1]).slice(SECURE_DRIVE_PREFIX.length) || null;
      }

      return null;
    } catch {
      return null;
    }
  }

  const pathWithoutQuery = trimmed.split('?')[0] || trimmed;
  const token = decodePathSegment(pathWithoutQuery.split('/').filter(Boolean).pop() || '');
  if (!token.startsWith(SECURE_DRIVE_PREFIX)) return null;

  const driveFileId = token.slice(SECURE_DRIVE_PREFIX.length).trim();
  return driveFileId || null;
};
