import assert from 'node:assert/strict';
import test from 'node:test';

import type { HrmDocument } from './hrmApi';
import {
  EMPTY_BANK_ACCOUNT_FORM,
  getActiveKycDocument,
  getMaskedKycIdentifier,
  isSuccessfulVerification,
  toBankAccountPayload,
  validateBankAccountForm,
} from './hrmKyc';

const doc = (overrides: Partial<HrmDocument>): HrmDocument => ({
  id: 'doc', category: 'TAX', title: 'PAN card (verified)', status: 'VERIFIED', provider: 'SUREPASS', version: 1,
  metadata: { documentType: 'PAN', maskedIdentifier: 'ABXXXX234F' }, createdAt: '2026-11-20T00:00:00.000Z', ...overrides,
});

test('active KYC document is the newest verified Surepass document of that type', () => {
  const documents = [
    doc({ id: 'old', createdAt: '2026-11-01T00:00:00.000Z' }),
    doc({ id: 'new', createdAt: '2026-11-22T00:00:00.000Z' }),
    doc({ id: 'archived', status: 'ARCHIVED', createdAt: '2026-11-23T00:00:00.000Z' }),
    doc({ id: 'aadhaar', metadata: { documentType: 'AADHAAR', maskedIdentifier: 'XXXXXXXX1234' } }),
    doc({ id: 'manual', provider: 'MANUAL' }),
  ];
  assert.equal(getActiveKycDocument(documents, 'PAN')?.id, 'new');
  assert.equal(getActiveKycDocument(documents, 'AADHAAR')?.id, 'aadhaar');
  assert.equal(getActiveKycDocument([], 'PAN'), null);
  assert.equal(getMaskedKycIdentifier(getActiveKycDocument(documents, 'AADHAAR')), 'XXXXXXXX1234');
  assert.equal(getMaskedKycIdentifier(null), '');
});

test('bank form requires holder, matching account numbers and a valid IFSC', () => {
  assert.deepEqual(Object.keys(validateBankAccountForm(EMPTY_BANK_ACCOUNT_FORM)).sort(), ['accountHolderName', 'accountNumber', 'ifsc']);
  const valid = { ...EMPTY_BANK_ACCOUNT_FORM, accountHolderName: 'Vikash Kumar', accountNumber: '1234 5678 9012', confirmAccountNumber: '123456789012', ifsc: 'sbin0001234' };
  assert.deepEqual(validateBankAccountForm(valid), {});
  assert.equal(validateBankAccountForm({ ...valid, confirmAccountNumber: '123456789013' }).confirmAccountNumber, 'Account numbers do not match.');
  assert.ok(validateBankAccountForm({ ...valid, ifsc: 'SBIN1001234' }).ifsc);
});

test('bank payload normalises digits and IFSC and never sends the confirmation field', () => {
  const payload = toBankAccountPayload({ ...EMPTY_BANK_ACCOUNT_FORM, accountHolderName: ' Vikash Kumar ', bankName: '', accountNumber: '1234-5678 9012', confirmAccountNumber: '123456789012', ifsc: 'sbin 0001234', isPrimary: true });
  assert.deepEqual(payload, { accountHolderName: 'Vikash Kumar', bankName: null, accountNumber: '123456789012', ifsc: 'SBIN0001234', isPrimary: true });
  assert.equal('confirmAccountNumber' in payload, false);
});

test('only a SUCCESS verification record counts as verified', () => {
  assert.equal(isSuccessfulVerification({ record: { id: 'r1', status: 'SUCCESS' } }), true);
  assert.equal(isSuccessfulVerification({ record: { id: 'r1', status: 'FAILED' } }), false);
  assert.equal(isSuccessfulVerification({ result: {} }), false);
  assert.equal(isSuccessfulVerification(null), false);
});
