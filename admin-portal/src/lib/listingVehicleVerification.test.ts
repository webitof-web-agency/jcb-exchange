import assert from 'node:assert/strict';
import test from 'node:test';
import {
  findMasterOption,
  getChassisSubmitValidationError,
  mapChassisToRcVehicle,
  normalizeMasterName,
} from './listingVehicleVerification';

test('maps chassis-to-RC response into partner listing fields and compliance dates', () => {
  const mapped = mapChassisToRcVehicle({
    rcNumber: 'PB00AZ1234',
    vehicleChasiNumber: 'MALBM51ABC123456',
    vehicleEngineNumber: 'D4FCJM12345',
    vehicleCategoryDescription: 'Motor Car(LMV)',
    makerDescription: 'HYUNDAI MOTOR INDIA LTD',
    makerModel: 'I20 SPORTZ CRDI',
    manufacturingDateFormatted: '2018-10',
    registrationDate: '2019-01-26',
    ownerNumber: '2',
    fuelType: 'DIESEL',
    insuranceUpto: '2099-01-20',
    fitUpTo: '2034-01-25',
    taxPaidUpto: '2034-01-25',
    puccUpto: '2030-01-25',
    registeredAt: 'FEROZPUR RTA, Punjab',
    financed: false,
  }, new Date('2026-10-10T00:00:00.000Z'));

  assert.deepEqual(mapped, {
    registrationNo: 'PB00AZ1234',
    chassisOrSerialNo: 'MALBM51ABC123456',
    engineNumber: 'D4FCJM12345',
    categoryName: 'Motor Car(LMV)',
    brandName: 'HYUNDAI MOTOR INDIA LTD',
    model: 'I20 SPORTZ CRDI',
    variant: '',
    fuelType: 'Diesel',
    manufacturingYear: '2018',
    registrationYear: '2019',
    previousOwners: '2',
    titleSuggestion: 'HYUNDAI MOTOR INDIA LTD I20 SPORTZ CRDI',
    insuranceExpiry: '2099-01-20',
    rtoDetails: {
      hirePurchaseStatus: 'NOT_APPLICABLE',
      taxStatus: 'VALID',
      taxValidUntil: '2034-01-25',
      fitnessStatus: 'VALID',
      fitnessValidUntil: '2034-01-25',
      insuranceStatus: 'VALID',
      pucStatus: 'VALID',
      pucValidUntil: '2030-01-25',
      rtoOffice: 'FEROZPUR RTA, Punjab',
    },
  });
});

test('matches provider category and brand names case-insensitively', () => {
  assert.equal(normalizeMasterName(' Motor  Car (LMV) '), 'motor car lmv');
  assert.deepEqual(findMasterOption([{ id: 'category-1', name: 'Motor Car (LMV)' }], 'motor car(lmv)'), {
    id: 'category-1',
    name: 'Motor Car (LMV)',
  });
  assert.equal(findMasterOption([{ id: 'brand-1', name: 'JCB' }], 'Hyundai'), undefined);
});

test('allows the same trusted admin roles to reuse the shared chassis submit rule', () => {
  assert.equal(getChassisSubmitValidationError('ABC123', '', true), null);
  assert.equal(
    getChassisSubmitValidationError('ABC123', '', false),
    'Verify the chassis number before posting this vehicle.',
  );
});
