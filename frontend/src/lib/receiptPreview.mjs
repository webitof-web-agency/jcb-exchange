const DRIVE_HOSTS = new Set(['drive.google.com', 'drive.usercontent.google.com', 'docs.google.com']);

const getDriveFileId = (value) => {
  try {
    const parsedUrl = new URL(value);
    if (!DRIVE_HOSTS.has(parsedUrl.hostname.toLowerCase())) {
      return null;
    }

    const queryId = parsedUrl.searchParams.get('id');
    if (queryId && /^[a-zA-Z0-9_-]{10,}$/.test(queryId)) {
      return queryId;
    }

    const pathMatch = parsedUrl.pathname.match(/\/file\/d\/([^/]+)/i);
    const pathId = pathMatch?.[1] || '';
    return /^[a-zA-Z0-9_-]{10,}$/.test(pathId) ? pathId : null;
  } catch {
    return null;
  }
};

export const getReceiptPreviewMode = (fileUrl) => {
  const normalizedUrl = typeof fileUrl === 'string' ? fileUrl.split(/[?#]/, 1)[0].toLowerCase() : '';

  if (/\.pdf$/.test(normalizedUrl)) {
    return 'document';
  }

  if (/\.(?:jpe?g|png|webp|gif|bmp|avif)$/.test(normalizedUrl)) {
    return 'image';
  }

  // Drive's thumbnail endpoint renders both legacy image receipts and the
  // first page of PDF receipts without navigating away from the modal.
  return getDriveFileId(fileUrl) ? 'image' : 'document';
};

export const getReceiptPreviewUrl = (fileUrl, fallbackUrl) => {
  const driveFileId = getDriveFileId(fileUrl);
  return driveFileId
    ? `https://drive.google.com/thumbnail?id=${encodeURIComponent(driveFileId)}&sz=w2000`
    : fallbackUrl;
};

export const getReceiptDocumentUrl = (fileUrl, fallbackUrl) => {
  const driveFileId = getDriveFileId(fileUrl);
  return driveFileId
    ? `https://drive.google.com/file/d/${encodeURIComponent(driveFileId)}/preview`
    : fallbackUrl;
};

export const shouldMaskDriveViewerControls = (value) => Boolean(getDriveFileId(value));
