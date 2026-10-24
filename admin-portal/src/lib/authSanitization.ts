/**
 * Auth Input Sanitization & Validation Utilities
 * Ensures strict sanitization against XSS, control characters, leading/trailing spaces,
 * and normalizes emails and phone numbers.
 */

export const sanitizeEmail = (raw: unknown): string => {
  if (typeof raw !== 'string') return '';
  // Strip control characters, HTML tags, null bytes, and common quote/escape characters
  return raw
    .replace(/\0/g, '')
    .replace(/[<>'"\\]/g, '')
    .replace(/[\u0000-\u001F\u007F-\u009F]/g, '')
    .trim()
    .toLowerCase();
};

export const isValidEmail = (email: string): boolean => {
  if (!email || email.length > 254) return false;
  // RFC 5322 compliant regex for practical email validation
  const emailRegex = /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)+$/;
  return emailRegex.test(email);
};

export const sanitizeMobile = (raw: unknown): string => {
  if (typeof raw !== 'string' && typeof raw !== 'number') return '';
  const digits = String(raw).replace(/\D/g, '');
  // If Indian mobile with 91 prefix and 12 digits, extract last 10
  if (digits.length === 12 && digits.startsWith('91')) {
    return digits.slice(2);
  }
  // If starts with 0 and is 11 digits
  if (digits.length === 11 && digits.startsWith('0')) {
    return digits.slice(1);
  }
  // Return last 10 digits
  return digits.slice(-10);
};

export const isValidIndianMobile = (mobile: string): boolean => {
  return /^[6-9]\d{9}$/.test(mobile);
};

export const sanitizeName = (raw: unknown): string => {
  if (typeof raw !== 'string') return '';
  return raw
    .replace(/\0/g, '')
    .replace(/<[^>]*>?/gm, '') // Strip HTML tags
    .replace(/[<>"'/\\;`]/g, '') // Strip script injection delimiters
    .replace(/[\u0000-\u001F\u007F-\u009F]/g, '')
    .replace(/\s+/g, ' ') // Collapse multiple spaces
    .trim()
    .slice(0, 100);
};

export const sanitizePassword = (raw: unknown): string => {
  if (typeof raw !== 'string') return '';
  // Remove null bytes and dangerous control characters, but preserve user's intended special symbols
  return raw
    .replace(/\0/g, '')
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '');
};
