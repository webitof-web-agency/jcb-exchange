export const PAN_REGEX = /^[A-Z]{5}[0-9]{4}[A-Z]$/;

export type ValidationResult = {
  valid: boolean;
  message?: string;
};

export const normalizePan = (value: unknown) =>
  typeof value === 'string' ? value.trim().toUpperCase() : '';

export const validatePan = (value: unknown): ValidationResult => {
  const pan = normalizePan(value);
  if (!pan) {
    return { valid: false, message: 'PAN number is required.' };
  }

  if (!PAN_REGEX.test(pan)) {
    return { valid: false, message: 'Enter a valid PAN in the format ABCDE1234F.' };
  }

  return { valid: true };
};

const isRealCalendarDate = (value: string) => {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return false;

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));

  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
};

export const validateDateOfBirth = (value: unknown, now = new Date()): ValidationResult => {
  if (typeof value !== 'string' || !value.trim()) {
    return { valid: false, message: 'Date of birth is required.' };
  }

  const normalized = value.trim();
  if (!isRealCalendarDate(normalized)) {
    return { valid: false, message: 'Enter a valid date of birth.' };
  }

  const date = new Date(`${normalized}T00:00:00.000Z`);
  const today = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  if (date > today) {
    return { valid: false, message: 'Date of birth cannot be in the future.' };
  }

  if (date.getUTCFullYear() < 1900) {
    return { valid: false, message: 'Enter a valid date of birth.' };
  }

  return { valid: true };
};

export const normalizeFullName = (value: unknown) =>
  typeof value === 'string' ? value.trim().replace(/\s+/g, ' ') : '';

export const validateFullName = (value: unknown): ValidationResult => {
  const fullName = normalizeFullName(value);
  if (!fullName) {
    return { valid: false, message: 'Full name is required.' };
  }

  if (fullName.length > 150 || /[\u0000-\u001f\u007f]/.test(fullName)) {
    return { valid: false, message: 'Enter a valid full name.' };
  }

  return { valid: true };
};

export const maskPan = (value: unknown) => {
  const pan = normalizePan(value);
  return PAN_REGEX.test(pan) ? `${pan.slice(0, 5)}****${pan.slice(-1)}` : '**********';
};

export const normalizeMaskedAadhaar = (value: unknown) => {
  const normalized = typeof value === 'string' ? value.trim().replace(/\s+/g, '') : '';
  if (!normalized) return null;

  if (/^[X*]{4,}\d{4}$/i.test(normalized)) {
    return normalized.replace(/\*/g, 'X').toUpperCase();
  }

  if (/^\d{12}$/.test(normalized)) {
    return `XXXXXXXX${normalized.slice(-4)}`;
  }

  return normalized.replace(/\d/g, 'X').slice(0, 16);
};

export const buildPanVerifyPayload = (input: {
  id_number: unknown;
  full_name: unknown;
  dob: unknown;
}) => ({
  id_number: normalizePan(input.id_number),
  full_name: normalizeFullName(input.full_name),
  dob: typeof input.dob === 'string' ? input.dob.trim() : '',
});

export type PanContactPayload = {
  id_number: string;
  fetch_email?: true;
};

export const buildPanContactPayload = (pan: unknown, fetchEmail: boolean): PanContactPayload => ({
  id_number: normalizePan(pan),
  ...(fetchEmail ? { fetch_email: true as const } : {}),
});

export const sanitizeContactResults = (data: unknown) => {
  const value = data && typeof data === 'object' ? data as Record<string, unknown> : {};
  const normalizeList = (entry: unknown) => Array.isArray(entry)
    ? entry.filter((item): item is string => typeof item === 'string' && item.trim().length > 0).map((item) => item.trim())
    : [];

  return {
    emails: normalizeList(value.email_id),
    mobileNumbers: normalizeList(value.mobile_number),
  };
};
