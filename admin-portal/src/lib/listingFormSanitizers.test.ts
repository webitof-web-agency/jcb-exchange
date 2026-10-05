import assert from 'node:assert/strict';
import test from 'node:test';
import { normalizeSellVehicleAvailability, sanitizeEngineNumber, SELL_VEHICLE_AVAILABILITY_OPTIONS } from './listingFormSanitizers';

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
