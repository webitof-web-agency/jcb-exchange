import api from '@/lib/api';
import { normalizeSecureDocumentPath } from '@/lib/secureDocumentPath.mjs';

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
