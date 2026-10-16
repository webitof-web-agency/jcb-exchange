import assert from 'node:assert/strict';
import test from 'node:test';

import { hasKycDocumentChanges, type KycDocumentSnapshot } from './kycEditPolicy';

const document = (overrides: Partial<KycDocumentSnapshot> = {}): KycDocumentSnapshot => ({
  documentType: 'PAN_CARD',
  fileUrl: '/secure/pan.webp',
  fileName: 'pan.webp',
  documentNumber: 'ABCDE1234F',
  nameOnDocument: 'Test Partner',
  issueDate: null,
  expiryDate: null,
  ...overrides,
});

test('detects a KYC document number change', () => {
  assert.equal(hasKycDocumentChanges([document()], [document({ documentNumber: 'FGHIJ5678K' })]), true);
});

test('does not flag an unchanged KYC document', () => {
  assert.equal(hasKycDocumentChanges([document()], [document()]), false);
});

test('detects document replacement and addition/removal', () => {
  assert.equal(hasKycDocumentChanges([document()], [document({ fileUrl: '/secure/new-pan.webp' })]), true);
  assert.equal(hasKycDocumentChanges([], [document()]), true);
  assert.equal(hasKycDocumentChanges([document()], []), true);
});
