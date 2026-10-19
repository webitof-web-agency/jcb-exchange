import assert from 'node:assert/strict';
import test from 'node:test';
import {
  findMasterOption,
  getProviderVehicleIdentityMismatch,
  getChassisSubmitValidationError,
  getVehicleVerificationSubmitValidationError,
  mapChassisToRcVehicle,
  mapProviderVehicleToListing,
  normalizeRegistrationNumber,
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
    ownerName: 'TARSEM SINGH',
    manufacturingDateFormatted: '2018-10',
    registrationDate: '2019-01-26',
    registration_valid_upto: '2034-01-25',
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
    registrationDate: '2019-01-26',
    registrationUpto: '2034-01-25',
    ownerName: 'TARSEM SINGH',
    previousOwners: '2',
    titleSuggestion: 'HYUNDAI MOTOR INDIA LTD I20 SPORTZ CRDI',
    insuranceExpiry: '2099-01-20',
    rtoDetails: {
      hirePurchaseStatus: 'NOT_APPLICABLE',
      financerName: '',
      taxStatus: 'VALID',
      taxValidUntil: '2034-01-25',
      fitnessStatus: 'VALID',
      fitnessValidUntil: '2034-01-25',
      insuranceStatus: 'VALID',
      pucStatus: 'VALID',
      pucValidUntil: '2030-01-25',
      hsrpNumber: '',
      rtoOffice: 'FEROZPUR RTA, Punjab',
    },
  });
});

test('maps registration validity aliases for admin listing autofill', () => {
  const mapped = mapProviderVehicleToListing({
    rc_number: 'DL01AB1234',
    registration_date: '2020-06-01',
    registration_valid_upto: '2040-06-01',
  });

  assert.equal(mapped.registrationDate, '2020-06-01');
  assert.equal(mapped.registrationUpto, '2040-06-01');
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

test('maps RC Full response into the same listing autofill contract', () => {
  const mapped = mapProviderVehicleToListing({
    rc_number: 'DL01AB1234',
    vehicle_chasi_number: 'CHASSIS123456',
    vehicle_engine_number: 'ENGINE123',
    maker_description: 'JCB',
    maker_model: '3DX',
    vehicle_category_description: 'Backhoe Loader',
    owner_name: 'TARSEM SINGH',
    manufacturing_date_formatted: '2020-04',
    registration_date: '2020-06-01',
  });

  assert.equal(mapped.registrationNo, 'DL01AB1234');
  assert.equal(mapped.chassisOrSerialNo, 'CHASSIS123456');
  assert.equal(mapped.titleSuggestion, 'JCB 3DX');
  assert.equal(mapped.ownerName, 'TARSEM SINGH');
});

test('rejects a provider response whose identity does not match the requested source', () => {
  assert.equal(
    getProviderVehicleIdentityMismatch('RC_FULL', 'DL01AB1234', '', { rcNumber: 'DL02ZZ9999' }),
    'The verified registration number does not match the entered registration number.',
  );
  assert.equal(
    getProviderVehicleIdentityMismatch('CHASSIS', 'DL01AB1234', 'CHASSIS123', { rcNumber: 'DL01AB1234', chassisOrSerialNo: 'OTHER' }),
    'The verified chassis number does not match the entered chassis number.',
  );
});

test('requires a fresh verification after either identity field changes', () => {
  assert.equal(normalizeRegistrationNumber(' dl 01-ab 1234 '), 'DL01AB1234');
  assert.equal(
    getVehicleVerificationSubmitValidationError({
      required: true,
      source: 'RC_FULL',
      currentRegistrationNumber: 'DL01AB1234',
      currentChassisNumber: 'CHASSIS123',
      verifiedRegistrationNumber: 'DL01AB1234',
      verifiedChassisNumber: 'CHASSIS123',
      verifiedSource: 'RC_FULL',
    }),
    null,
  );
  assert.equal(
    getVehicleVerificationSubmitValidationError({
      required: true,
      source: 'RC_FULL',
      currentRegistrationNumber: 'DL02AB1234',
      currentChassisNumber: 'CHASSIS123',
      verifiedRegistrationNumber: 'DL01AB1234',
      verifiedChassisNumber: 'CHASSIS123',
      verifiedSource: 'RC_FULL',
    }),
    'Verify the current registration number before posting this vehicle.',
  );
});
