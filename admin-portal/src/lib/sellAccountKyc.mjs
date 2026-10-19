export const SELL_ACCOUNT_KYC_STATUS = {
  NOT_VERIFIED: 'NOT_VERIFIED',
  VERIFIED: 'VERIFIED',
  FAILED: 'FAILED',
  NOT_AVAILABLE: 'NOT_AVAILABLE',
};

const text = (value) => (typeof value === 'string' ? value.trim() : '');

export const normalizeSellAccountKycNumber = (kind, value) => {
  const normalized = text(value).toUpperCase();
  if (kind === 'PAN' || kind === 'GST') return normalized.replace(/\s+/g, '');
  return normalized.replace(/[^0-9]/g, '');
};

const emptyState = (kind) => ({
  number: '',
  status: kind === 'AADHAAR' ? SELL_ACCOUNT_KYC_STATUS.NOT_AVAILABLE : SELL_ACCOUNT_KYC_STATUS.NOT_VERIFIED,
  verificationRecordId: '',
  verifiedAt: '',
  cacheHit: false,
  error: '',
});

export const createEmptySellAccountKyc = () => ({
  purchase: {
    pan: emptyState('PAN'),
    gst: emptyState('GST'),
    aadhaar: emptyState('AADHAAR'),
  },
  sell: {
    pan: emptyState('PAN'),
    gst: emptyState('GST'),
    aadhaar: emptyState('AADHAAR'),
  },
});

const normalizeStatus = (kind, value) => {
  const status = text(value).toUpperCase();
  if (kind === 'AADHAAR') return SELL_ACCOUNT_KYC_STATUS.NOT_AVAILABLE;
  return [SELL_ACCOUNT_KYC_STATUS.NOT_VERIFIED, SELL_ACCOUNT_KYC_STATUS.VERIFIED, SELL_ACCOUNT_KYC_STATUS.FAILED].includes(status)
    ? status
    : SELL_ACCOUNT_KYC_STATUS.NOT_VERIFIED;
};

const normalizeState = (kind, value) => {
  const source = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  const fallback = emptyState(kind);
  return {
    ...fallback,
    number: normalizeSellAccountKycNumber(kind, source.number),
    status: normalizeStatus(kind, source.status),
    verificationRecordId: text(source.verificationRecordId).slice(0, 100),
    verifiedAt: text(source.verifiedAt).slice(0, 50),
    cacheHit: source.cacheHit === true,
    error: text(source.error).slice(0, 500),
  };
};

export const normalizeSellAccountKyc = (record = {}) => {
  const persistedDocuments = record.documents && typeof record.documents === 'object' && !Array.isArray(record.documents)
    ? record.documents
    : {};
  const source = record.kyc && typeof record.kyc === 'object' && !Array.isArray(record.kyc)
    ? record.kyc
    : persistedDocuments.kyc && typeof persistedDocuments.kyc === 'object' && !Array.isArray(persistedDocuments.kyc)
      ? persistedDocuments.kyc
      : {};
  return {
    purchase: {
      pan: normalizeState('PAN', source.purchase?.pan),
      gst: normalizeState('GST', source.purchase?.gst),
      aadhaar: normalizeState('AADHAAR', source.purchase?.aadhaar),
    },
    sell: {
      pan: normalizeState('PAN', source.sell?.pan),
      gst: normalizeState('GST', source.sell?.gst),
      aadhaar: normalizeState('AADHAAR', source.sell?.aadhaar),
    },
  };
};

export const createVerificationState = ({ kind, number, response, now = new Date().toISOString() }) => {
  const normalizedNumber = normalizeSellAccountKycNumber(kind, number);
  const record = response?.record && typeof response.record === 'object' ? response.record : {};
  const verified = response?.success === true && text(record.status).toUpperCase() === 'SUCCESS';

  return {
    number: normalizedNumber,
    status: verified ? SELL_ACCOUNT_KYC_STATUS.VERIFIED : SELL_ACCOUNT_KYC_STATUS.FAILED,
    verificationRecordId: text(record.id).slice(0, 100),
    verifiedAt: verified ? text(record.completedAt || record.createdAt) || now : '',
    cacheHit: response?.cacheHit === true,
    error: verified ? '' : text(record.safeMessage) || 'Verification failed. Please try again.',
  };
};

export const createFailedVerificationState = (kind, number, error) => ({
  ...emptyState(kind),
  number: normalizeSellAccountKycNumber(kind, number),
  status: SELL_ACCOUNT_KYC_STATUS.FAILED,
  error: text(error).slice(0, 500) || 'Verification failed. Please try again.',
});
