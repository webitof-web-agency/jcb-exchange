import assert from 'node:assert/strict';
import test from 'node:test';

import {
  normalizeRcChallanForm,
  validateRcChallanForm,
} from './rcChallan';

test('normalizes RC challan form fields without changing the provider contract', () => {
  assert.deepEqual(normalizeRcChallanForm({
    rcNumber: ' hr 55 ap 0244 ',
    chassisNumber: 'ma3 jmtb1spb851591',
    engineNumber: 'k10c nc265773',
  }), {
    rc_number: 'HR55AP0244',
    chassis_number: 'MA3JMTB1SPB851591',
    engine_number: 'K10CNC265773',
  });
});

test('requires all RC challan identifiers', () => {
  assert.equal(validateRcChallanForm({
    rcNumber: 'HR55AP0244',
    chassisNumber: '',
    engineNumber: 'K10CNC265773',
  }), 'Chassis number is required.');
});
