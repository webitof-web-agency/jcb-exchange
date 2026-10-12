import assert from 'node:assert/strict';
import test from 'node:test';

import {
  normalizeMobileNumber,
  validateMobileNumber,
  validateMobileToPanName,
} from './mobileToPan';

test('normalizes Mobile To PAN mobile input consistently with the backend', () => {
  assert.equal(normalizeMobileNumber(' +91 88888 08969 '), '8888808969');
  assert.equal(validateMobileNumber('8888808969'), null);
  assert.equal(validateMobileToPanName('Sambhaaji Singh'), null);
});

test('rejects invalid Mobile To PAN values before the API call', () => {
  assert.equal(validateMobileNumber(''), 'Mobile number is required.');
  assert.equal(validateMobileNumber('12345'), 'Enter a valid 10-digit mobile number.');
  assert.equal(validateMobileToPanName(''), 'Name is required.');
});
