import assert from 'node:assert/strict';
import test from 'node:test';
import {
  getOptionalPinCodeValidationError,
  normalizeSellVehicleAvailability,
  sanitizeEngineNumber,
  SELL_VEHICLE_AVAILABILITY_OPTIONS,
} from './listingFormSanitizers';

test('sanitizes engine numbers without changing valid vehicle identifiers', () => {
  assert.equal(sanitizeEngineNumber(' eng-12/ab. 45! '), 'ENG-12/AB45');
  assert.equal(sanitizeEngineNumber(''), '');
});

test('allows only available and sold in the sell vehicle availability choices', () => {
  assert.deepEqual(SELL_VEHICLE_AVAILABILITY_OPTIONS, ['AVAILABLE', 'SOLD']);
  assert.equal(normalizeSellVehicleAvailability('RESERVED'), 'AVAILABLE');
  assert.equal(normalizeSellVehicleAvailability('SOLD'), 'SOLD');
  assert.equal(normalizeSellVehicleAvailability('PENDING'), 'PENDING');
});

test('allows an empty listing PIN code but validates a provided PIN code', () => {
  assert.equal(getOptionalPinCodeValidationError(''), null);
  assert.equal(getOptionalPinCodeValidationError('49200'), 'Pin code must be exactly 6 digits.');
  assert.equal(getOptionalPinCodeValidationError('492001'), null);
});
