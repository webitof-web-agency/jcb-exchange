import api from '@/lib/api';
import { normalizeSecureDocumentPath } from '@/lib/secureDocumentPath.mjs';

const getFallbackContentType = (fileName: string) => {
  const extension = fileName.split('.').pop()?.toLowerCase();
  if (extension === 'pdf') return 'application/pdf';
  if (extension === 'jpg' || extension === 'jpeg') return 'image/jpeg';
  if (extension === 'png') return 'image/png';
  if (extension === 'webp') return 'image/webp';
  if (extension === 'gif') return 'image/gif';
  if (extension === 'bmp') return 'image/bmp';
  if (extension === 'svg') return 'image/svg+xml';
  return 'application/octet-stream';
};

export const fetchSecureDocumentBlob = async (fileUrl: string, fileName = 'document') => {
  const response = await api.get(normalizeSecureDocumentPath(fileUrl), {
    responseType: 'blob',
  });

  const contentType =
    typeof response.headers?.['content-type'] === 'string'
      ? response.headers['content-type']
      : getFallbackContentType(fileName);
  const resolvedContentType = contentType && contentType !== 'application/octet-stream'
    ? contentType
    : getFallbackContentType(fileName);

  if (response.data instanceof Blob && response.data.type && response.data.type !== 'application/octet-stream') {
    return response.data;
  }

  return response.data instanceof Blob
    ? new Blob([response.data], { type: resolvedContentType })
    : new Blob([response.data], { type: resolvedContentType });
};

export const downloadSecureDocument = async (fileUrl: string, fileName: string) => {
  const blob = await fetchSecureDocumentBlob(fileUrl, fileName);

  const objectUrl = window.URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = objectUrl;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => window.URL.revokeObjectURL(objectUrl), 1000);
};

export const createSecureDocumentPreviewUrl = async (fileUrl: string, fileName: string) => {
  const blob = await fetchSecureDocumentBlob(fileUrl, fileName);
  return window.URL.createObjectURL(blob);
};
