export const maskPartnerDocumentNumber = (value: string | null | undefined) => {
  const normalized = value?.trim().toUpperCase() || '';
  if (!normalized) return '';
  if (normalized.length <= 4) return '*'.repeat(normalized.length);
  return `${normalized.slice(0, 2)}${'*'.repeat(Math.max(4, normalized.length - 4))}${normalized.slice(-2)}`;
};

export const formatPartnerDocumentStatus = (value: string | null | undefined) => {
  const normalized = value?.trim().toUpperCase();
  if (!normalized) return 'NOT_STARTED';
  return normalized;
};

export type PartnerDocumentKind = 'pdf' | 'image' | 'file';

export const getPartnerDocumentKind = (
  fileName: string | null | undefined,
  fileUrl: string | null | undefined,
): PartnerDocumentKind => {
  const sources = [fileName || '', fileUrl || ''].map((value) => value.trim().toLowerCase());

  if (sources.some((source) => /\.pdf(?:$|[?#])/.test(source))) {
    return 'pdf';
  }

  if (sources.some((source) => /\.(?:jpe?g|png|webp|gif|bmp|svg)(?:$|[?#])/.test(source))) {
    return 'image';
  }

  return 'file';
};

export const canPreviewPartnerDocument = (
  fileName: string | null | undefined,
  fileUrl: string | null | undefined,
) => getPartnerDocumentKind(fileName, fileUrl) === 'image';
