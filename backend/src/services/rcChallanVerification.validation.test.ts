import assert from 'node:assert/strict';
import test from 'node:test';

import {
  normalizeRcChallanRequest,
  validateRcChallanRequest,
} from './rcChallanVerification.validation';

test('normalizes the advanced RC challan request to the provider contract', () => {
  const normalized = normalizeRcChallanRequest({
    rc_number: ' hr 55 ap 0244 ',
    chassis_number: 'ignored',
    engine_number: 'ignored',
  });

  assert.deepEqual(normalized, { rc_number: 'HR55AP0244' });
});

test('requires the RC number for advanced RC challan verification', () => {
  assert.equal(
    validateRcChallanRequest({ rc_number: '' }),
    'Registration number is required.',
  );
});

test('accepts the advanced RC challan request with only an RC number', () => {
  assert.equal(validateRcChallanRequest({ rc_number: 'HR55AP0244' }), null);
});
