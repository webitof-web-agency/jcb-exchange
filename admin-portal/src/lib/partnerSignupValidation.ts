import { isValidEmail } from './authSanitization';

const GSTIN_PATTERN = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][A-Z0-9]Z[A-Z0-9]$/;
const CONSUMER_EMAIL_DOMAINS = new Set([
  'aol.com', 'gmx.com', 'gmail.com', 'gmail.in', 'googlemail.com', 'hotmail.com',
  'icloud.com', 'live.com', 'mail.com', 'me.com', 'msn.com', 'outlook.com',
  'proton.me', 'protonmail.com', 'rediffmail.com', 'yahoo.com', 'yahoo.co.in', 'ymail.com',
]);

export const isValidPartnerBusinessEmail = (value: unknown): boolean => {
  if (typeof value !== 'string') return false;
  const normalized = value.trim().toLowerCase();
  if (!isValidEmail(normalized)) return false;
  const [, domain = ''] = normalized.split('@');
  return Boolean(domain) && !CONSUMER_EMAIL_DOMAINS.has(domain);
};

export const isValidPartnerGstin = (value: unknown): boolean => {
  return typeof value === 'string' && GSTIN_PATTERN.test(value.trim());
};

export type PartnerGstVerificationReadinessInput = {
  gstin: unknown;
  email: unknown;
  mobile: unknown;
  countryId: unknown;
  stateId: unknown;
  cityId: unknown;
};

export const getPartnerGstVerificationReadiness = (input: PartnerGstVerificationReadinessInput) => {
  const missing: string[] = [];
  const gstin = typeof input.gstin === 'string' ? input.gstin.replace(/\s/g, '').toUpperCase() : '';

  if (!isValidPartnerGstin(gstin)) missing.push('GSTIN');

  return { ready: missing.length === 0, missing };
};
