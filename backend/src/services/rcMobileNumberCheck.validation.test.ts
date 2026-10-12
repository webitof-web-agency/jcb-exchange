import assert from 'node:assert/strict';
import test from 'node:test';

import {
  normalizeRcMobileNumberCheck,
  validateRcMobileNumberCheck,
} from './rcMobileNumberCheck.validation';

test('normalizes RC and mobile values to the exact provider format', () => {
  assert.deepEqual(
    normalizeRcMobileNumberCheck({ rc_number: ' up 10 ab 1234 ', mobile_number: '+91 99990 00123' }),
    { rcNumber: 'UP10AB1234', mobileNumber: '9999000123' },
  );
  assert.equal(validateRcMobileNumberCheck({ rc_number: 'UP10AB1234', mobile_number: '9999000123' }), null);
});

test('rejects incomplete RC or mobile input before calling the provider', () => {
  assert.equal(validateRcMobileNumberCheck({ rc_number: '', mobile_number: '9999000123' }), 'Vehicle registration number is required.');
  assert.equal(validateRcMobileNumberCheck({ rc_number: 'UP10AB1234', mobile_number: '12345' }), 'Enter a valid 10-digit mobile number.');
});
