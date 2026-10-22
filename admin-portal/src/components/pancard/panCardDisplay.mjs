export const DEFAULT_PAN_SIGNATURE_URL = '/images/pancard/rohit-signature.png';

export const resolvePanCardSignatureUrl = (data) => {
  if (!data) return DEFAULT_PAN_SIGNATURE_URL;
  return data.signatureUrl || data.signature_url;
};
