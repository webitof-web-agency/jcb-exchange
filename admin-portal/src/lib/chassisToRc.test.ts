import assert from 'node:assert/strict';
import test from 'node:test';
import { normalizeChassisNumber, validateChassisNumber } from './chassisToRc';

test('normalizes chassis input consistently with the backend', () => {
  assert.equal(normalizeChassisNumber(' mal bm 51 abc 123456 '), 'MALBM51ABC123456');
  assert.equal(validateChassisNumber('MALBM51ABC123456'), null);
});

test('rejects unsafe chassis values before the API call', () => {
  assert.equal(validateChassisNumber(''), 'Chassis number is required.');
  assert.equal(validateChassisNumber('MAL<script>'), 'Enter a valid chassis number.');
});
