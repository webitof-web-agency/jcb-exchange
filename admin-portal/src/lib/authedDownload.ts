import api from '@/lib/api';

const fileNameFromDisposition = (header: unknown) => {
  const match = /filename="?([^";]+)"?/i.exec(String(header || ''));
  return match?.[1] || '';
};

/** Downloads a file from an authenticated API endpoint (the browser cannot send the token itself). */
export const downloadAuthedFile = async (path: string, fallbackName: string) => {
  const response = await api.get(path, { responseType: 'blob' });
  const contentType = response.headers?.['content-type'];
  const blob = new Blob([response.data], { type: typeof contentType === 'string' ? contentType : 'application/pdf' });
  const url = URL.createObjectURL(blob);
  const anchor = window.document.createElement('a');
  anchor.href = url;
  anchor.download = fileNameFromDisposition(response.headers?.['content-disposition']) || fallbackName;
  window.document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
};

/** Error responses for blob requests arrive as a Blob; read the JSON message out of it. */
export const readBlobErrorMessage = async (error: unknown, fallback: string) => {
  const data = (error as { response?: { data?: unknown } })?.response?.data;
  if (data instanceof Blob) {
    try {
      const parsed = JSON.parse(await data.text());
      if (typeof parsed?.error === 'string') return parsed.error;
    } catch {
      return fallback;
    }
  }
  const message = (data as { error?: unknown } | undefined)?.error;
  return typeof message === 'string' ? message : fallback;
};
