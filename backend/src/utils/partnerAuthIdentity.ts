import { extractDriveFileIdFromSecureUrl } from './secureDocumentUrl';

export const normalizeAadhaarNumber = (value: unknown) =>
  typeof value === 'string' ? value.replace(/\D/g, '').slice(0, 12) : '';

export const validateAadhaarNumber = (value: unknown) => {
  const normalized = normalizeAadhaarNumber(value);
  if (!normalized) return 'Aadhaar number is required.';
  if (normalized.length !== 12) return 'Aadhaar number must contain exactly 12 digits.';
  return null;
};

export const isSecurePartnerPhotoUrl = (value: unknown) => {
  if (typeof value !== 'string' || !value.trim()) return false;
  return Boolean(extractDriveFileIdFromSecureUrl(value));
};

export const validatePartnerAuthIdentityPatch = (value: unknown) => {
  const body = value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
  if (Object.prototype.hasOwnProperty.call(body, 'aadhaarNumber')) {
    return 'Aadhaar verification is verification-only and cannot be saved from Auth.';
  }
  if (!Object.prototype.hasOwnProperty.call(body, 'photoUrl')) {
    return 'A partner photo is required.';
  }
  return null;
};
