import assert from 'node:assert/strict';
import test from 'node:test';
import {
  normalizeRcNumber,
  validateRcNumber,
} from './rcOwnerHistory.validation';

test('normalizes a registration number without enforcing one rigid state format', () => {
  assert.equal(normalizeRcNumber(' rj 12 xj 1234 '), 'RJ12XJ1234');
  assert.equal(validateRcNumber('RJ12XJ1234'), null);
});

test('rejects empty or unsafe registration input', () => {
  assert.equal(validateRcNumber(''), 'Vehicle registration number is required.');
  assert.equal(validateRcNumber('RJ12<script>'), 'Enter a valid vehicle registration number.');
});
