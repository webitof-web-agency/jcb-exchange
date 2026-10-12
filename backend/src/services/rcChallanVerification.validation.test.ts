import assert from 'node:assert/strict';
import test from 'node:test';

import {
  normalizeRcChallanRequest,
  validateRcChallanRequest,
} from './rcChallanVerification.validation';

test('normalizes RC challan identifiers and supported state portals', () => {
  const normalized = normalizeRcChallanRequest({
    rc_number: ' hr 55 ap 0244 ',
    chassis_number: 'ma3 jmtb1spb851591',
    engine_number: 'k10c nc265773',
    state_only: true,
    state_portal: ['dl', 'TS', 'DL'],
  });

  assert.deepEqual(normalized, {
    rc_number: 'HR55AP0244',
    chassis_number: 'MA3JMTB1SPB851591',
    engine_number: 'K10CNC265773',
    state_only: true,
    state_portal: ['DL', 'TS'],
  });
});

test('requires all three RC challan identifiers', () => {
  assert.equal(
    validateRcChallanRequest({ rc_number: 'HR55AP0244', chassis_number: '', engine_number: 'K10CNC265773' }),
    'Chassis number is required.',
  );
  assert.equal(
    validateRcChallanRequest({ rc_number: 'HR55AP0244', chassis_number: 'MA3JMTB1SPB851591', engine_number: '' }),
    'Engine number is required.',
  );
});

test('rejects unsupported state portal values when filtering is enabled', () => {
  assert.equal(
    validateRcChallanRequest({
      rc_number: 'HR55AP0244',
      chassis_number: 'MA3JMTB1SPB851591',
      engine_number: 'K10CNC265773',
      state_only: true,
      state_portal: ['MH'],
    }),
    'Select one or more supported state portals: DL, TS, KA, GJ.',
  );
});
