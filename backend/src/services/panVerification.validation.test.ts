import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildPanContactPayload,
  maskPan,
  normalizePan,
  validateDateOfBirth,
  validatePan,
} from './panVerification.validation';

test('normalizes lowercase PAN input and masks only the middle characters', () => {
  assert.equal(normalizePan('  abcpd1234e '), 'ABCPD1234E');
  assert.equal(maskPan('ABCPD1234E'), 'ABCPD****E');
});

test('rejects invalid PAN formats and missing values', () => {
  for (const value of ['', 'ABC1234E', 'ABCPD12345', 'ABCPD1234!', 'ABCPD1234EF']) {
    assert.equal(validatePan(value).valid, false, `${value} should be invalid`);
  }

  assert.equal(validatePan('ABCPD1234E').valid, true);
});

test('accepts valid past date and rejects invalid or future dates', () => {
  assert.equal(validateDateOfBirth('2000-01-01').valid, true);
  assert.equal(validateDateOfBirth('2000-02-31').valid, false);
  assert.equal(validateDateOfBirth('2999-01-01').valid, false);
});

test('omits fetch_email when email lookup is not requested', () => {
  assert.deepEqual(buildPanContactPayload(' abcpd1234e ', false), {
    id_number: 'ABCPD1234E',
  });
  assert.deepEqual(buildPanContactPayload('ABCPD1234E', true), {
    id_number: 'ABCPD1234E',
    fetch_email: true,
  });
});
