const CONSUMER_EMAIL_DOMAINS = new Set([
  'aol.com', 'gmx.com', 'gmail.com', 'gmail.in', 'googlemail.com', 'hotmail.com',
  'icloud.com', 'live.com', 'mail.com', 'me.com', 'msn.com', 'outlook.com',
  'proton.me', 'protonmail.com', 'rediffmail.com', 'yahoo.com', 'yahoo.co.in',
  'ymail.com',
]);

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export type BusinessEmailValidation =
  | { valid: true; normalized: string }
  | { valid: false; code: 'invalid_format' | 'consumer_domain' };

/** Partner registrations require a dealer/company-owned email domain. */
export const validateBusinessEmail = (value: unknown): BusinessEmailValidation => {
  const normalized = typeof value === 'string' ? value.trim().toLowerCase() : '';
  if (!normalized || normalized.length > 254 || !EMAIL_PATTERN.test(normalized)) {
    return { valid: false, code: 'invalid_format' };
  }
  const [, domain = ''] = normalized.split('@');
  if (!domain || domain.length > 253 || CONSUMER_EMAIL_DOMAINS.has(domain)) {
    return { valid: false, code: 'consumer_domain' };
  }
  return { valid: true, normalized };
};

export const isBusinessEmail = (value: unknown) => validateBusinessEmail(value).valid;
