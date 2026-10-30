export type PartnerKycDocumentType = 'PAN_CARD' | 'GST_CERTIFICATE' | 'AADHAAR_CARD';

type BuildVerifiedKycDocumentStateInput = {
  documentType: PartnerKycDocumentType;
  recordId: string;
  documentNumber?: unknown;
  nameOnDocument?: unknown;
  templateSaved: boolean;
  cacheHit?: boolean | undefined;
  completedAt?: unknown;
};

const normalizedText = (value: unknown) => {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed || undefined;
};

const normalizedDate = (value: unknown) => {
  const date = value ? new Date(String(value)) : new Date();
  return Number.isNaN(date.getTime()) ? new Date() : date;
};

export const buildVerifiedKycDocumentState = ({
  documentType,
  recordId,
  documentNumber,
  nameOnDocument,
  templateSaved,
  cacheHit,
  completedAt,
}: BuildVerifiedKycDocumentStateInput) => ({
  documentType,
  documentNumber: normalizedText(documentNumber) || null,
  nameOnDocument: normalizedText(nameOnDocument) || null,
  verificationRecordId: recordId,
  verificationStatus: 'VERIFIED' as const,
  verificationCacheHit: cacheHit ?? false,
  verificationCompletedAt: normalizedDate(completedAt),
  verificationMessage: null,
  status: templateSaved ? ('UPLOADED' as const) : ('NOT_UPLOADED' as const),
});

type MergeVerifiedKycResponseStateInput<T extends Record<string, unknown>> = {
  base: T;
  recordId: string;
  recordStatus?: string | null;
  result?: Record<string, unknown> | null;
  template?: Record<string, unknown> | null;
  rawDataExpiresAt?: unknown | undefined;
};

export const mergeVerifiedKycResponseState = <T extends Record<string, unknown>>({
  base,
  recordId,
  recordStatus,
  result,
  template,
  rawDataExpiresAt,
}: MergeVerifiedKycResponseStateInput<T>) => {
  if (recordStatus !== 'SUCCESS') {
    return {
      ...base,
      verificationTemplate: template || null,
      verificationRawDataExpiresAt: null,
    };
  }

  return {
    ...base,
    verificationRecordId: recordId,
    verificationStatus: 'VERIFIED',
    ...(template ? { status: 'UPLOADED' } : {}),
    verificationResult: result || null,
    verificationTemplate: template || null,
    verificationMessage: '',
    verificationRawDataExpiresAt: typeof rawDataExpiresAt === 'string' ? rawDataExpiresAt : null,
  };
};
