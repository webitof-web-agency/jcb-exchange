import { isValidGstin, isValidIfsc, isValidPan, isValidPinCode, normalizeGstin, normalizeIdentifier, normalizeIndianMobile } from '../modules/finance-hub/utils/india';

// Format checks for the fields every form shares (mobile, email, PAN, GSTIN, IFSC, PIN code, vehicle number,
// amounts). Empty values pass: whether a field is required stays with each form. On edits, pass the stored
// value as `previous`: an unchanged value is accepted as is, so older records that predate these checks can
// still be saved without retyping fields nobody touched.

export class FieldValidationError extends Error {
  readonly status = 400;
  constructor(message: string, readonly field?: string | undefined) {
    super(message);
    this.name = 'FieldValidationError';
  }
}

export type FieldKind = 'mobile' | 'email' | 'pan' | 'gstin' | 'ifsc' | 'pincode' | 'vehicle';

const EMAIL = /^[a-z0-9._%+-]+@[a-z0-9-]+(?:\.[a-z0-9-]+)*\.[a-z]{2,}$/;
// Regular series (CG04DM1005, MP09A1234, DL1CAB1234) and Bharat series (22BH1234AB).
const VEHICLE = /^(?:[A-Z]{2}\d{1,2}[A-Z]{0,3}\d{1,4}|\d{2}BH\d{4}[A-Z]{1,2})$/;

const RULES: Record<FieldKind, { normalize: (value: string) => string | null; message: string }> = {
  mobile: { normalize: (value) => normalizeIndianMobile(value), message: 'enter a valid 10-digit Indian mobile number' },
  email: { normalize: (value) => { const email = value.trim().toLowerCase(); return EMAIL.test(email) && email.length <= 254 ? email : null; }, message: 'enter a valid email address' },
  pan: { normalize: (value) => { const pan = normalizeIdentifier(value); return isValidPan(pan) ? pan : null; }, message: 'enter a valid 10-character PAN (e.g. ABCDE1234F)' },
  gstin: { normalize: (value) => { const gstin = normalizeGstin(value); return isValidGstin(gstin) ? gstin : null; }, message: 'enter a valid 15-character GSTIN' },
  ifsc: { normalize: (value) => { const ifsc = normalizeIdentifier(value); return isValidIfsc(ifsc) ? ifsc : null; }, message: 'enter a valid 11-character IFSC (e.g. SBIN0001234)' },
  pincode: { normalize: (value) => { const pin = value.replace(/\s/g, ''); return isValidPinCode(pin) ? pin : null; }, message: 'enter a valid 6-digit PIN code' },
  vehicle: { normalize: (value) => { const number = value.toUpperCase().replace(/[^A-Z0-9]/g, ''); return VEHICLE.test(number) ? number : null; }, message: 'enter a valid vehicle registration number (e.g. CG04DM1005)' },
};

const text = (value: unknown) => (typeof value === 'string' || typeof value === 'number' ? String(value).trim() : '');

/**
 * Returns the normalised value (e.g. "+91 98765 43210" -> "9876543210"), null when empty, and throws
 * FieldValidationError("<label>: enter a valid ...") when the format is wrong.
 */
export const validateField = (kind: FieldKind, value: unknown, label: string, options: { previous?: string | null | undefined; field?: string | undefined } = {}) => {
  const raw = text(value);
  if (!raw) return null;
  if (options.previous !== undefined && options.previous !== null && raw === String(options.previous).trim()) return raw;
  const normalized = RULES[kind].normalize(raw);
  if (normalized === null) throw new FieldValidationError(`${label}: ${RULES[kind].message}.`, options.field);
  return normalized;
};

/** Money: a finite number, not negative, at most two decimals, below a sanity ceiling. Empty -> null. */
export const validateAmount = (value: unknown, label: string, options: { max?: number | undefined; allowZero?: boolean | undefined; field?: string | undefined } = {}) => {
  const raw = typeof value === 'number' ? String(value) : text(value).replace(/,/g, '');
  if (!raw) return null;
  const amount = Number(raw);
  const max = options.max ?? 1_000_000_000;
  if (!/^\d+(?:\.\d{1,2})?$/.test(raw) || !Number.isFinite(amount)) throw new FieldValidationError(`${label}: enter an amount in rupees (up to 2 decimals).`, options.field);
  if (amount > max) throw new FieldValidationError(`${label}: amount is too large.`, options.field);
  if (amount === 0 && options.allowZero === false) throw new FieldValidationError(`${label}: amount must be greater than 0.`, options.field);
  return amount;
};
