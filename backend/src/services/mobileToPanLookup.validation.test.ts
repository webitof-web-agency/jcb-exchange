import assert from 'node:assert/strict';
import test from 'node:test';

import {
  normalizeMobileNumber,
  normalizeMobileToPanName,
  validateMobileNumber,
  validateMobileToPanName,
} from './mobileToPanLookup.validation';

test('normalizes the Mobile To PAN request values', () => {
  assert.equal(normalizeMobileNumber(' +91 88888 08969 '), '8888808969');
  assert.equal(normalizeMobileToPanName('  Sambhaaji   Singh '), 'Sambhaaji Singh');
  assert.equal(validateMobileNumber('8888808969'), null);
  assert.equal(validateMobileToPanName('Sambhaaji Singh'), null);
});

test('rejects invalid Mobile To PAN input before the provider request', () => {
  assert.equal(validateMobileNumber(''), 'Mobile number is required.');
  assert.equal(validateMobileNumber('12345'), 'Enter a valid 10-digit mobile number.');
  assert.equal(validateMobileToPanName(''), 'Name is required.');
  assert.equal(validateMobileToPanName('a'.repeat(151)), 'Enter a valid name.');
});
