import type { HrmDocument, HrmKycDocumentType } from './hrmApi';

/** The verified PAN / Aadhaar currently on file for an employee (archived or rejected ones are ignored). */
export const getActiveKycDocument = (
  documents: readonly HrmDocument[] | undefined,
  documentType: HrmKycDocumentType,
): HrmDocument | null => {
  const matches = (documents ?? []).filter((document) => (
    document.provider === 'SUREPASS'
    && document.status === 'VERIFIED'
    && document.metadata?.documentType === documentType
  ));
  if (!matches.length) return null;
  return [...matches].sort((a, b) => new Date(b.createdAt ?? 0).getTime() - new Date(a.createdAt ?? 0).getTime())[0] ?? null;
};

export const getMaskedKycIdentifier = (document: HrmDocument | null): string => {
  const value = document?.metadata?.maskedIdentifier;
  return typeof value === 'string' && value.trim() ? value.trim() : '';
};

export const IFSC_PATTERN = /^[A-Z]{4}0[A-Z0-9]{6}$/;

export type BankAccountForm = {
  accountHolderName: string;
  bankName: string;
  accountNumber: string;
  confirmAccountNumber: string;
  ifsc: string;
  isPrimary: boolean;
};

export const EMPTY_BANK_ACCOUNT_FORM: BankAccountForm = {
  accountHolderName: '',
  bankName: '',
  accountNumber: '',
  confirmAccountNumber: '',
  ifsc: '',
  isPrimary: false,
};

export const normalizeAccountNumber = (value: string) => value.replace(/\D/g, '').slice(0, 20);
export const normalizeIfsc = (value: string) => value.replace(/[^a-zA-Z0-9]/g, '').toUpperCase().slice(0, 11);

/** Field errors for the bank account form; an empty object means the form can be saved. */
export const validateBankAccountForm = (form: BankAccountForm): Partial<Record<keyof BankAccountForm, string>> => {
  const errors: Partial<Record<keyof BankAccountForm, string>> = {};
  const holder = form.accountHolderName.trim();
  if (holder.length < 2) errors.accountHolderName = 'Enter the account holder name as printed in the bank records.';
  const bankName = form.bankName.trim();
  if (bankName && bankName.length < 2) errors.bankName = 'Bank name looks too short.';
  const accountNumber = normalizeAccountNumber(form.accountNumber);
  if (accountNumber.length < 6 || accountNumber.length > 20) errors.accountNumber = 'Enter a valid account number (6 to 20 digits).';
  if (!errors.accountNumber && normalizeAccountNumber(form.confirmAccountNumber) !== accountNumber) {
    errors.confirmAccountNumber = 'Account numbers do not match.';
  }
  if (!IFSC_PATTERN.test(normalizeIfsc(form.ifsc))) errors.ifsc = 'Enter a valid 11-character IFSC (for example SBIN0001234).';
  return errors;
};

/** Payload for the HRM bank-account endpoint (digits and IFSC normalised, confirmation dropped). */
export const toBankAccountPayload = (form: BankAccountForm) => ({
  accountHolderName: form.accountHolderName.trim(),
  bankName: form.bankName.trim() || null,
  accountNumber: normalizeAccountNumber(form.accountNumber),
  ifsc: normalizeIfsc(form.ifsc),
  isPrimary: form.isPrimary,
});

const isObject = (value: unknown): value is Record<string, unknown> => Boolean(value && typeof value === 'object' && !Array.isArray(value));

/** True when a PAN / Aadhaar verification API response represents a successful verification. */
export const isSuccessfulVerification = (response: unknown): boolean => {
  if (!isObject(response) || !isObject(response.record)) return false;
  return response.record.status === 'SUCCESS' && typeof response.record.id === 'string' && Boolean(response.record.id);
};
