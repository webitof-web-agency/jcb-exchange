type DateLike = Date | string | null | undefined;

type VerificationRecordSummary = {
  status?: string | null;
  createdAt?: DateLike;
  completedAt?: DateLike;
};

export type KycReviewDocumentInput = {
  id: string;
  documentType: string;
  fileUrl: string | null;
  fileName: string | null;
  documentNumber: string | null;
  nameOnDocument: string | null;
  issueDate: DateLike;
  expiryDate: DateLike;
  submittedNote: string | null;
  status: string;
  reviewComment: string | null;
  verificationRecordId: string | null;
  verificationStatus: string | null;
  verificationCacheHit: boolean;
  verificationMessage: string | null;
  verificationCompletedAt: DateLike;
};

type VerificationDetail = {
  record?: VerificationRecordSummary | null;
  result?: Record<string, unknown> | null;
} | null;

const isoDate = (value: DateLike) => {
  if (!value) return null;
  const parsed = value instanceof Date ? value : new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
};

export const buildKycReviewDocument = (
  document: KycReviewDocumentInput,
  detail: VerificationDetail,
) => {
  const hasSuccessfulResult = detail?.record?.status === 'SUCCESS' && !!detail.result;
  const status = hasSuccessfulResult
    ? 'VERIFIED'
    : detail?.record?.status === 'FAILED'
      ? 'FAILED'
      : document.verificationStatus || 'NOT_STARTED';

  return {
    ...document,
    issueDate: isoDate(document.issueDate),
    expiryDate: isoDate(document.expiryDate),
    verificationStatus: status,
    verificationRecordId: document.verificationRecordId || '',
    verificationCacheHit: document.verificationCacheHit === true,
    verificationMessage: hasSuccessfulResult ? null : document.verificationMessage,
    verificationRequestedAt: isoDate(detail?.record?.createdAt),
    verificationCompletedAt: isoDate(detail?.record?.completedAt) || isoDate(document.verificationCompletedAt),
    verificationResult: hasSuccessfulResult ? detail.result : null,
  };
};
