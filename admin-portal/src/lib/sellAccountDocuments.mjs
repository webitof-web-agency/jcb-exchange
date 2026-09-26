export const SELL_ACCOUNT_DOCUMENT_KEYS = [
  'purchaseDeed',
  'purchaseAadhaarCard',
  'purchasePanCard',
  'purchaseGstCertificate',
  'sellDeed',
  'sellAadhaarCard',
  'sellPanCard',
  'sellGstCertificate',
];

export const createEmptySellAccountDocuments = () => Object.fromEntries(
  SELL_ACCOUNT_DOCUMENT_KEYS.map((key) => [key, null]),
);

const normalizeSellAccountDocument = (value) => {
  if (!value) return null;

  if (typeof value === 'string') {
    return {
      access: 'secure',
      fileName: value.split('/').pop() || 'document.pdf',
      originalName: value.split('/').pop() || 'document.pdf',
      mimeType: 'application/pdf',
      size: 0,
      fileUrl: value,
      absoluteUrl: value,
    };
  }

  if (typeof value !== 'object') return null;

  const fileUrl = value.fileUrl || value.url || value.absoluteUrl;
  if (!fileUrl) return null;

  return {
    ...value,
    access: value.access || 'secure',
    fileName: value.fileName || value.originalName || 'document.pdf',
    originalName: value.originalName || value.fileName || 'document.pdf',
    mimeType: value.mimeType || 'application/pdf',
    size: Number(value.size) || 0,
    fileUrl,
    absoluteUrl: value.absoluteUrl || fileUrl,
  };
};

export const normalizeSellAccountDocuments = (record = {}) => {
  const documents = createEmptySellAccountDocuments();
  const source = {
    ...record,
    ...(record.documents && typeof record.documents === 'object' ? record.documents : {}),
  };

  for (const key of SELL_ACCOUNT_DOCUMENT_KEYS) {
    documents[key] = normalizeSellAccountDocument(source[key]);
  }
  return documents;
};

export const getSellAccountDocumentKeys = (section) =>
  section === 'purchase'
    ? SELL_ACCOUNT_DOCUMENT_KEYS.slice(0, 4)
    : SELL_ACCOUNT_DOCUMENT_KEYS.slice(4);
