import assert from 'node:assert/strict';
import test from 'node:test';
import { sanitizeChassisToRcResultForSeller } from './chassisToRcVerification.controller';

test('returns only listing autofill fields to sellers', () => {
  assert.deepEqual(sanitizeChassisToRcResultForSeller({
    rcNumber: 'PB00AZ1234',
    registrationUpto: '2040-01-26',
    vehicleChasiNumber: 'MALBM51ABC123456',
    ownerName: 'TARSEM SINGH',
    presentAddress: 'PRIVATE ADDRESS',
    mobileNumber: '9999999999',
    makerModel: 'I20 SPORTZ CRDI',
    vehicleCategoryDescription: 'Motor Car(LMV)',
    insuranceUpto: '2025-01-20',
    registeredAt: 'FEROZPUR RTA, Punjab',
    financed: false,
  }), {
    rcNumber: 'PB00AZ1234',
    registrationUpto: '2040-01-26',
    vehicleChasiNumber: 'MALBM51ABC123456',
    makerModel: 'I20 SPORTZ CRDI',
    vehicleCategoryDescription: 'Motor Car(LMV)',
    insuranceUpto: '2025-01-20',
    registeredAt: 'FEROZPUR RTA, Punjab',
    financed: false,
  });
});
