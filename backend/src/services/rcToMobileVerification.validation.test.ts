import assert from 'node:assert/strict';
import test from 'node:test';
import {
  normalizeRcNumber,
  validateRcNumber,
} from './rcToMobileVerification.validation';

test('normalizes RC input consistently with the other RC verification flows', () => {
  assert.equal(normalizeRcNumber(' rj 14 xj 1234 '), 'RJ14XJ1234');
  assert.equal(validateRcNumber('RJ14XJ1234'), null);
});

test('rejects empty and unsafe RC input before any provider request', () => {
  assert.equal(validateRcNumber(''), 'Vehicle registration number is required.');
  assert.equal(validateRcNumber('RJ14<script>'), 'Enter a valid vehicle registration number.');
});
