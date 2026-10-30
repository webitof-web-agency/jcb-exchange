const BLOB_URL_PATTERN = /^blob:/i;

const isBlobUrl = (value) => typeof value === 'string' && BLOB_URL_PATTERN.test(value.trim());

export const getSafeDocumentPreviewSource = ({ localObjectUrl, fetchedObjectUrl }) => {
  if (isBlobUrl(localObjectUrl)) return localObjectUrl;
  if (isBlobUrl(fetchedObjectUrl)) return fetchedObjectUrl;
  return '';
};

export const getDocumentPreviewMimeType = (fileName, isPdf = false) => {
  if (isPdf) return 'application/pdf';

  const extension = typeof fileName === 'string'
    ? fileName.trim().toLowerCase().split('?')[0].split('#')[0].split('.').pop()
    : '';

  if (extension === 'png') return 'image/png';
  if (extension === 'webp') return 'image/webp';
  return 'image/jpeg';
};
