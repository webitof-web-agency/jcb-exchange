import { normalizeGstin } from '../services/gstVerification.validation';
import { normalizePan } from '../services/panVerification.validation';
import { createVerificationFingerprint, isFreshVerificationResult } from '../services/verificationCache';

type KycVerificationRecord = {
  status?: unknown;
  requestedById?: unknown;
  requestFingerprint?: unknown;
  encryptedResult?: unknown;
  completedAt?: unknown;
  template?: { id?: unknown } | null;
};

type KycVerificationRecordInput = {
  documentType: string;
  documentNumber?: string | null;
  requestedById?: string | null | undefined;
  record?: KycVerificationRecord | null;
};

export const isKycVerificationRecordValid = ({
  documentType,
  documentNumber,
  requestedById,
  record,
}: KycVerificationRecordInput) => {
  if (!isKycVerificationRecordPersistable({ documentType, documentNumber: documentNumber ?? null, requestedById, record: record ?? null })) return false;
  return isFreshVerificationResult(record!);
};

/**
 * A successful result remains a historical verification result after the
 * cache TTL. The TTL controls whether a new Verify request may reuse it; it
 * must not make a saved onboarding draft appear unverified on reload.
 */
export const isKycVerificationRecordPersistable = ({
  documentType,
  documentNumber,
  requestedById,
  record,
}: KycVerificationRecordInput) => {
  if (!record || record.status !== 'SUCCESS') return false;
  const hasEncryptedResult = typeof record.encryptedResult === 'string' && !!record.encryptedResult;
  const hasSavedTemplate = typeof record.template?.id === 'string' && !!record.template.id;
  if (!hasEncryptedResult && !hasSavedTemplate) return false;

  const normalizedNumber = documentType === 'PAN_CARD'
    ? normalizePan(documentNumber)
    : documentType === 'GST_CERTIFICATE'
      ? normalizeGstin(documentNumber)
      : '';
  if (!normalizedNumber) return false;

  const namespace = documentType === 'PAN_CARD' ? 'PAN_COMPREHENSIVE_V2' : 'GST_VERIFY';
  return record.requestFingerprint === createVerificationFingerprint(namespace, { id_number: normalizedNumber });
};
