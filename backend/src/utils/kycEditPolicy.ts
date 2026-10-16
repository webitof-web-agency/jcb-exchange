export type KycDocumentSnapshot = {
  documentType: string;
  fileUrl?: string | null;
  fileName?: string | null;
  documentNumber?: string | null;
  nameOnDocument?: string | null;
  issueDate?: Date | string | null;
  expiryDate?: Date | string | null;
};

const REVERIFICATION_DOCUMENT_TYPES = new Set([
  'PAN_CARD',
  'GST_CERTIFICATE',
  'AADHAAR_CARD',
  'PASSPORT_PHOTO',
]);

const comparableDate = (value: Date | string | null | undefined) => {
  if (!value) return '';
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
};

const comparableDocument = (document: KycDocumentSnapshot) => [
  document.documentType,
  document.fileUrl || '',
  document.fileName || '',
  document.documentNumber || '',
  document.nameOnDocument || '',
  comparableDate(document.issueDate),
  comparableDate(document.expiryDate),
].join('|');

export const hasKycDocumentChanges = (
  currentDocuments: KycDocumentSnapshot[],
  nextDocuments: KycDocumentSnapshot[],
) => {
  const current = currentDocuments
    .filter((document) => REVERIFICATION_DOCUMENT_TYPES.has(document.documentType))
    .map(comparableDocument)
    .sort();
  const next = nextDocuments
    .filter((document) => REVERIFICATION_DOCUMENT_TYPES.has(document.documentType))
    .map(comparableDocument)
    .sort();

  return current.length !== next.length || current.some((value, index) => value !== next[index]);
};
