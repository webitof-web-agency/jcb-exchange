const IMAGE_MIME_PATTERN = /^image\/(jpeg|png|webp|gif|bmp|avif)$/i;
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

export const getReceiptMediaType = (url, mimeType) => {
  const normalizedMimeType = typeof mimeType === 'string' ? mimeType.trim().toLowerCase() : '';

  if (normalizedMimeType === 'application/pdf' || normalizedMimeType === 'application/x-pdf') {
    return 'pdf';
  }

  if (IMAGE_MIME_PATTERN.test(normalizedMimeType)) {
    return 'image';
  }

  const normalizedUrl = typeof url === 'string' ? url.split(/[?#]/, 1)[0].toLowerCase() : '';
  if (/\.pdf$/.test(normalizedUrl)) {
    return 'pdf';
  }

  if (/\.(?:jpe?g|png|webp|gif|bmp|avif)$/.test(normalizedUrl)) {
    return 'image';
  }

  // Legacy Drive URLs do not carry a file extension. A document frame can
  // render both PDFs and images, while an <img> cannot render PDFs.
  return 'document';
};

export const isSafeReceiptUrl = (value) => {
  if (typeof value !== 'string' || !value.trim()) {
    return false;
  }

  try {
    const parsedUrl = new URL(value);
    return parsedUrl.protocol === 'https:' || parsedUrl.protocol === 'http:';
  } catch {
    return false;
  }
};

export const getReceiptDocumentUrl = (value) => {
  const driveFileId = getDriveFileId(value);
  return driveFileId
    ? `https://drive.google.com/file/d/${encodeURIComponent(driveFileId)}/preview`
    : value;
};

export const getReceiptThumbnailUrl = (value) => {
  const driveFileId = getDriveFileId(value);
  return driveFileId
    ? `https://drive.google.com/thumbnail?id=${encodeURIComponent(driveFileId)}&sz=w2000`
    : null;
};

export const shouldMaskDriveViewerControls = (value) => Boolean(getDriveFileId(value));
