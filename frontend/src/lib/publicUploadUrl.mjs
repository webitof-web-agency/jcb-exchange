export const normalizePublicUploadUrl = (value) => {
  const trimmed = typeof value === 'string' ? value.trim() : '';
  if (!trimmed) return '';

  if (/^https?:\/\//i.test(trimmed)) {
    try {
      const parsed = new URL(trimmed);
      parsed.pathname = parsed.pathname.replace(/^\/api(?=\/uploads\/public(?:\/|$))/i, '');
      return parsed.toString();
    } catch {
      return trimmed;
    }
  }

  return trimmed.replace(/^\/api(?=\/uploads\/public(?:\/|$))/i, '');
};

const DRIVE_HOSTS = new Set(['drive.google.com', 'drive.usercontent.google.com', 'docs.google.com']);

export const getDriveMediaProxyPath = (value) => {
  if (typeof value !== 'string' || !value.trim()) return null;

  try {
    const parsedUrl = new URL(value);
    if (!DRIVE_HOSTS.has(parsedUrl.hostname.toLowerCase())) return null;

    const queryId = parsedUrl.searchParams.get('id');
    const pathId = parsedUrl.pathname.match(/\/file\/d\/([^/]+)/i)?.[1] || '';
    const fileId = queryId || pathId;
    if (!/^[a-zA-Z0-9_-]{10,}$/.test(fileId)) return null;

    return `/api/documents/upload/public/listing-media/drive/${encodeURIComponent(fileId)}`;
  } catch {
    return null;
  }
};
