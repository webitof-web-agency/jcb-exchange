export type PartnerKycDocumentType =
  | 'PAN_CARD'
  | 'AADHAAR_CARD'
  | 'PASSPORT_PHOTO'
  | 'CANCELLED_CHEQUE'
  | 'GST_CERTIFICATE'
  | 'AUTHORIZED_PERSON_ID';

const REQUIRED_DOCUMENT_TYPES: readonly PartnerKycDocumentType[] = ['GST_CERTIFICATE'];

const LEGACY_DOCUMENT_TYPES: readonly PartnerKycDocumentType[] = [
  'PAN_CARD',
  'AADHAAR_CARD',
  'PASSPORT_PHOTO',
];

const SUPPORTING_DOCUMENT_TYPES: readonly PartnerKycDocumentType[] = [
  'CANCELLED_CHEQUE',
  'AUTHORIZED_PERSON_ID',
];

export const getPartnerRequiredDocumentTypes = (partnerType?: string | null): PartnerKycDocumentType[] =>
  partnerType ? [...REQUIRED_DOCUMENT_TYPES] : [];

export const getPartnerAllowedDocumentTypes = (partnerType?: string | null): PartnerKycDocumentType[] =>
  partnerType
    ? [...REQUIRED_DOCUMENT_TYPES, ...LEGACY_DOCUMENT_TYPES, ...SUPPORTING_DOCUMENT_TYPES]
    : [];

export type PartnerKycDocumentReadiness = {
  documentType: string;
  fileUrl?: string | null;
  verificationTemplateId?: string | null;
};

export const arePartnerRequiredDocumentsComplete = (
  documents: readonly PartnerKycDocumentReadiness[],
  partnerType?: string | null,
): boolean => {
  const readyDocumentTypes = new Set(
    documents
      .filter((document) => Boolean(document.fileUrl || document.verificationTemplateId))
      .map((document) => document.documentType),
  );

  return getPartnerRequiredDocumentTypes(partnerType).every((documentType) =>
    readyDocumentTypes.has(documentType),
  );
};

export const isLegacyPartnerDocumentType = (documentType: string): boolean =>
  LEGACY_DOCUMENT_TYPES.includes(documentType as PartnerKycDocumentType);
