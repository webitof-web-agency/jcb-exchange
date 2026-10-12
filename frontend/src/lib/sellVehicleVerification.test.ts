import assert from 'node:assert/strict';
import test from 'node:test';
import {
  getChassisSubmitValidationError,
  getProviderDateStatus,
  mapChassisToRcVehicle,
} from './sellVehicleVerification';

test('maps the nested chassis-to-RC details response to Sell Vehicle fields', () => {
  const mapped = mapChassisToRcVehicle({
    rcNumber: 'PB00AZ1234',
    registrationDate: '2019-01-26',
    vehicleChasiNumber: 'MALBM51ABC123456',
    vehicleEngineNumber: 'D4FCJM12345',
    vehicleCategory: 'LMV',
    vehicleCategoryDescription: 'Motor Car(LMV)',
    makerDescription: 'HYUNDAI MOTOR INDIA LTD',
    makerModel: 'I20 SPORTZ CRDI',
    variant: 'SPORTZ',
    fuelType: 'DIESEL',
    manufacturingDateFormatted: '2018-10',
    ownerNumber: '2',
    fitUpTo: '2034-01-25',
    insuranceUpto: '2025-01-20',
    taxUpto: '2030-04-01',
    puccUpto: '2027-05-01',
    financed: false,
    registeredAt: 'FEROZPUR RTA, Punjab',
  }, new Date('2026-10-10T00:00:00.000Z'));

  assert.deepEqual(mapped, {
    registrationNo: 'PB00AZ1234',
    chassisOrSerialNo: 'MALBM51ABC123456',
    engineNumber: 'D4FCJM12345',
    categoryName: 'Motor Car(LMV)',
    brandName: 'HYUNDAI MOTOR INDIA LTD',
    model: 'I20 SPORTZ CRDI',
    variant: 'SPORTZ',
    fuelType: 'Diesel',
    manufacturingYear: '2018',
    registrationYear: '2019',
    previousOwners: '2',
    titleSuggestion: 'HYUNDAI MOTOR INDIA LTD I20 SPORTZ CRDI',
    insuranceExpiry: '',
    rtoDetails: {
      hirePurchaseStatus: 'NOT_APPLICABLE',
      taxStatus: 'VALID',
      taxValidUntil: '2030-04-01',
      fitnessStatus: 'VALID',
      fitnessValidUntil: '2034-01-25',
      insuranceStatus: 'EXPIRED',
      pucStatus: 'VALID',
      pucValidUntil: '2027-05-01',
      rtoOffice: 'FEROZPUR RTA, Punjab',
    },
  });
});

test('does not call a missing or malformed provider date valid', () => {
  assert.equal(getProviderDateStatus('', new Date('2026-10-10T00:00:00.000Z')), 'NOT_AVAILABLE');
  assert.equal(getProviderDateStatus('2026-02-30', new Date('2026-10-10T00:00:00.000Z')), 'NOT_AVAILABLE');
  assert.equal(getProviderDateStatus('2026-10-10', new Date('2026-10-10T00:00:00.000Z')), 'VALID');
});

test('blocks a normal submit when the current chassis was not verified', () => {
  assert.equal(
    getChassisSubmitValidationError('MALBM51ABC123456', '', false),
    'Verify the chassis number before posting this vehicle.',
  );
  assert.equal(
    getChassisSubmitValidationError('MALBM51ABC123456', 'OTHER123456', false),
    'Verify the current chassis number before posting this vehicle.',
  );
  assert.equal(getChassisSubmitValidationError('MALBM51ABC123456', '', true), null);
});
