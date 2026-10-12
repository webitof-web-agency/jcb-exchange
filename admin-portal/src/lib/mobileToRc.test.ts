import assert from 'node:assert/strict';
import test from 'node:test';

import { normalizeMobileNumber, validateMobileNumber } from './mobileToRc';

test('normalizes mobile input consistently with the backend', () => {
  assert.equal(normalizeMobileNumber(' +91 89088 85858 '), '8908885858');
  assert.equal(validateMobileNumber('8908885858'), null);
});

test('rejects missing and invalid mobile values before the API call', () => {
  assert.equal(validateMobileNumber(''), 'Mobile number is required.');
  assert.equal(validateMobileNumber('12345'), 'Enter a valid 10-digit mobile number.');
  assert.equal(validateMobileNumber('89088abc85858'), 'Mobile number is required.');
});
