import assert from 'node:assert/strict';
import test from 'node:test';
import { normalizeRcNumber, validateRcNumber } from './rcToMobile';

test('normalizes RC input consistently with the backend', () => {
  assert.equal(normalizeRcNumber(' rj 14 xj 1234 '), 'RJ14XJ1234');
  assert.equal(validateRcNumber('RJ14XJ1234'), null);
});

test('rejects unsafe RC values before the API call', () => {
  assert.equal(validateRcNumber(''), 'Vehicle registration number is required.');
  assert.equal(validateRcNumber('RJ14<script>'), 'Enter a valid vehicle registration number.');
});
