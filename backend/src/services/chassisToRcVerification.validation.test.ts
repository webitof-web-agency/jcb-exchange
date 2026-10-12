import assert from 'node:assert/strict';
import test from 'node:test';
import {
  normalizeChassisNumber,
  validateChassisNumber,
} from './chassisToRcVerification.validation';

test('normalizes chassis input without imposing a rigid VIN format', () => {
  assert.equal(normalizeChassisNumber(' mal bm 51 abc 123456 '), 'MALBM51ABC123456');
  assert.equal(validateChassisNumber('MALBM51ABC123456'), null);
});

test('rejects empty, unsafe, and oversized chassis input', () => {
  assert.equal(validateChassisNumber(''), 'Chassis number is required.');
  assert.equal(validateChassisNumber('MAL<script>'), 'Enter a valid chassis number.');
  assert.equal(validateChassisNumber('A'.repeat(101)), 'Enter a valid chassis number.');
});
