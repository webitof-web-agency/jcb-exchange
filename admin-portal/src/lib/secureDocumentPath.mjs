const secureDrivePrefix = 'drive-';

const getDriveFileId = (value) => {
  try {
    const parsed = new URL(value);
    const directId = parsed.searchParams.get('id');
    if (directId) return directId;

    const pathMatch = parsed.pathname.match(/\/file\/d\/([^/]+)/i);
    return pathMatch?.[1] ? decodeURIComponent(pathMatch[1]) : null;
  } catch {
    return null;
  }
};

export const normalizeSecureDocumentPath = (fileUrl) => {
  const trimmed = fileUrl.trim();

  if (!trimmed) {
    throw new Error('File URL is required.');
  }

  if (/^https?:\/\//i.test(trimmed)) {
    const driveFileId = getDriveFileId(trimmed);
    if (driveFileId) {
      return `/documents/secure/${secureDrivePrefix}${encodeURIComponent(driveFileId)}`;
    }

    const parsed = new URL(trimmed);
    return `${parsed.pathname}${parsed.search}`.replace(/^\/api(?=\/|$)/i, '');
  }

  const normalizedPath = trimmed.startsWith('/') ? trimmed : `/${trimmed}`;
  return normalizedPath.replace(/^\/api(?=\/|$)/i, '');
};
