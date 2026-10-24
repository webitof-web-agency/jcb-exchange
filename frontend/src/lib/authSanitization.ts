/**
 * Auth Input Sanitization & Validation Utilities
 * Ensures strict sanitization against XSS, control characters, leading/trailing spaces,
 * and normalizes emails and phone numbers.
 */

export const sanitizeEmail = (raw: unknown): string => {
  if (typeof raw !== 'string') return '';
  return raw
    .replace(/\0/g, '')
    .replace(/[<>'"\\]/g, '')
    .replace(/[\u0000-\u001F\u007F-\u009F]/g, '')
    .trim()
    .toLowerCase();
};

export const isValidEmail = (email: string): boolean => {
  if (!email || email.length > 254) return false;
  const emailRegex = /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)+$/;
  return emailRegex.test(email);
};

export const sanitizeMobile = (raw: unknown): string => {
  if (typeof raw !== 'string' && typeof raw !== 'number') return '';
  const digits = String(raw).replace(/\D/g, '');
  if (digits.length === 12 && digits.startsWith('91')) {
    return digits.slice(2);
  }
  if (digits.length === 11 && digits.startsWith('0')) {
    return digits.slice(1);
  }
  return digits.slice(-10);
};

export const isValidIndianMobile = (mobile: string): boolean => {
  return /^[6-9]\d{9}$/.test(mobile);
};

export const sanitizeName = (raw: unknown): string => {
  if (typeof raw !== 'string') return '';
  return raw
    .replace(/\0/g, '')
    .replace(/<[^>]*>?/gm, '')
    .replace(/[<>"'/\\;`]/g, '')
    .replace(/[\u0000-\u001F\u007F-\u009F]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 100);
};

export const sanitizePassword = (raw: unknown): string => {
  if (typeof raw !== 'string') return '';
  return raw
    .replace(/\0/g, '')
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '');
};
