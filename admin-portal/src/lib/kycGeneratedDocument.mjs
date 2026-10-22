const GENERATED_DOCUMENT_KEYS = {
  purchase: {
    pan: 'purchasePanCard',
    aadhaar: 'purchaseAadhaarCard',
  },
  sell: {
    pan: 'sellPanCard',
    aadhaar: 'sellAadhaarCard',
  },
};

export const getGeneratedKycDocumentKey = ({ side, kind }) => {
  if (side !== 'purchase' && side !== 'sell') return null;
  if (kind !== 'pan' && kind !== 'aadhaar') return null;
  return GENERATED_DOCUMENT_KEYS[side][kind];
};

export const getGeneratedKycDocumentFileName = ({ kind, number }) => {
  const safeNumber = String(number || 'verification').replace(/[^a-zA-Z0-9_-]+/g, '-');
  return `${kind === 'aadhaar' ? 'AADHAAR' : 'PAN'}-${safeNumber}-verification.pdf`;
};

export const getGeneratedKycUploadLabel = ({ uploading, hasUploadedDocument }) => (
  uploading ? 'Uploading...' : hasUploadedDocument ? 'Replace in KYC' : 'Upload'
);
