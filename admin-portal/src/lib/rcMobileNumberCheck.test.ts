import assert from 'node:assert/strict';
import test from 'node:test';

import { normalizeRcMobileNumberCheck, validateRcMobileNumberCheck } from './rcMobileNumberCheck';

test('normalizes RC and mobile input consistently with the backend', () => {
  assert.deepEqual(
    normalizeRcMobileNumberCheck({ rcNumber: ' up 10 ab 1234 ', mobileNumber: '+91 99990 00123' }),
    { rcNumber: 'UP10AB1234', mobileNumber: '9999000123' },
  );
  assert.equal(validateRcMobileNumberCheck({ rcNumber: 'UP10AB1234', mobileNumber: '9999000123' }), null);
});

test('rejects incomplete RC and mobile input before the API call', () => {
  assert.equal(validateRcMobileNumberCheck({ rcNumber: '', mobileNumber: '9999000123' }), 'Vehicle registration number is required.');
  assert.equal(validateRcMobileNumberCheck({ rcNumber: 'UP10AB1234', mobileNumber: '12345' }), 'Enter a valid 10-digit mobile number.');
});
