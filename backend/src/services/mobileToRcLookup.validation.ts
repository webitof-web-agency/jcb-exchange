const MOBILE_NUMBER_PATTERN = /^(?:[1-9]\d{9}|0[1-9]\d{9})$/;

export const normalizeMobileNumber = (value: unknown) => {
  if (typeof value !== 'string') return '';
  const trimmed = value.trim();
  if (!trimmed || !/^[+()\-\s\d]+$/.test(trimmed)) return '';
  const digits = trimmed.replace(/\D/g, '');
  if (digits.length === 12 && digits.startsWith('91')) return digits.slice(2);
  if (digits.length === 11 && digits.startsWith('0')) return digits.slice(1);
  return digits;
};

export const validateMobileNumber = (value: unknown) => {
  const normalized = normalizeMobileNumber(value);
  if (!normalized) return 'Mobile number is required.';
  if (!MOBILE_NUMBER_PATTERN.test(normalized)) return 'Enter a valid 10-digit mobile number.';
  return null;
};
