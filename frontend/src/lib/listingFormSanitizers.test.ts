import assert from 'node:assert/strict';
import test from 'node:test';
import {
  isValidDigitsOnlyValue,
  isValidDateValue,
  isValidPinCodeValue,
  isValidYearValue,
  normalizeSellVehicleAvailability,
  sanitizeEngineNumber,
  SELL_VEHICLE_AVAILABILITY_OPTIONS,
} from './listingFormSanitizers';

test('sanitizes engine numbers without changing valid vehicle identifiers', () => {
  assert.equal(sanitizeEngineNumber(' eng-12/ab. 45! '), 'ENG-12/AB. 45');
  assert.equal(sanitizeEngineNumber(''), '');
});

test('allows only available and sold in the sell vehicle availability choices', () => {
  assert.deepEqual(SELL_VEHICLE_AVAILABILITY_OPTIONS, ['AVAILABLE', 'SOLD']);
  assert.equal(normalizeSellVehicleAvailability('RESERVED'), 'AVAILABLE');
  assert.equal(normalizeSellVehicleAvailability('SOLD'), 'SOLD');
  assert.equal(normalizeSellVehicleAvailability('PENDING'), 'PENDING');
});

test('shares the same numeric field validation contract used by the partner portal', () => {
  assert.equal(isValidYearValue('2019'), true);
  assert.equal(isValidYearValue('201'), false);
  assert.equal(isValidYearValue(''), true);
  assert.equal(isValidPinCodeValue('492001'), true);
  assert.equal(isValidPinCodeValue('49200'), false);
  assert.equal(isValidDigitsOnlyValue('2450000'), true);
  assert.equal(isValidDigitsOnlyValue('24.5'), false);
  assert.equal(isValidDateValue('2019-01-26'), true);
  assert.equal(isValidDateValue('2019-02-30'), false);
  assert.equal(isValidDateValue('2019'), false);
});
