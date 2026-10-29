import assert from 'node:assert/strict';
import test from 'node:test';

import {
  normalizeRcChallanForm,
  validateRcChallanForm,
} from './rcChallan';

test('normalizes the RC Challan Advanced form to the documented request', () => {
  assert.deepEqual(normalizeRcChallanForm({
    rcNumber: ' hr 55 ap 0244 ',
  }), { rc_number: 'HR55AP0244' });
});

test('requires the RC number for advanced RC challan verification', () => {
  assert.equal(validateRcChallanForm({ rcNumber: 'HR55AP0244' }), null);
  assert.equal(validateRcChallanForm({ rcNumber: '' }), 'Registration number is required.');
});
