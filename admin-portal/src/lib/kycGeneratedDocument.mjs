const GENERATED_DOCUMENT_KEYS = {
  purchase: {
    pan: 'purchasePanCard',
    aadhaar: 'purchaseAadhaarCard',
    gst: 'purchaseGstCertificate',
  },
  sell: {
    pan: 'sellPanCard',
    aadhaar: 'sellAadhaarCard',
    gst: 'sellGstCertificate',
  },
};

export const getGeneratedKycDocumentKey = ({ side, kind }) => {
  if (side !== 'purchase' && side !== 'sell') return null;
  if (kind !== 'pan' && kind !== 'aadhaar' && kind !== 'gst') return null;
  return GENERATED_DOCUMENT_KEYS[side][kind];
};

export const getGeneratedKycDocumentFileName = ({ kind, number }) => {
  const safeNumber = String(number || 'verification').replace(/[^a-zA-Z0-9_-]+/g, '-');
  const prefix = kind === 'aadhaar' ? 'AADHAAR' : kind === 'gst' ? 'GST' : 'PAN';
  return `${prefix}-${safeNumber}-verification.pdf`;
};

export const getGeneratedKycUploadLabel = ({ uploading, hasUploadedDocument }) => (
  uploading ? 'Uploading...' : hasUploadedDocument ? 'Replace in KYC' : 'Upload'
);
