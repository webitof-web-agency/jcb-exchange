import api from '@/lib/api';

const normalizeSecureDocumentPath = (fileUrl: string) => {
  const trimmed = fileUrl.trim();

  if (!trimmed) {
    throw new Error('File URL is required.');
  }

  if (/^https?:\/\//i.test(trimmed)) {
    const parsed = new URL(trimmed);
    return parsed.pathname.replace(/^\/api(?=\/|$)/i, '');
  }

  const normalizedPath = trimmed.startsWith('/') ? trimmed : `/${trimmed}`;
  return normalizedPath.replace(/^\/api(?=\/|$)/i, '');
};

export const downloadSecureDocument = async (fileUrl: string, fileName: string) => {
  const response = await api.get(normalizeSecureDocumentPath(fileUrl), {
    responseType: 'blob',
  });

  const contentType =
    typeof response.headers?.['content-type'] === 'string'
      ? response.headers['content-type']
      : 'application/octet-stream';

  const blob = response.data instanceof Blob
    ? response.data
    : new Blob([response.data], { type: contentType });

  const objectUrl = window.URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = objectUrl;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.URL.revokeObjectURL(objectUrl);
};
