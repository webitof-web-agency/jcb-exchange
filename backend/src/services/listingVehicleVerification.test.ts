import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildChassisVerificationFingerprint,
  buildCurrentListingVerificationSnapshot,
  buildProviderListingVerificationSnapshot,
  getListingVerificationStatus,
  isUsableChassisVerification,
  syncListingVehicleVerification,
} from './listingVehicleVerification';

test('accepts only a successful verification for the same chassis and owner', () => {
  const chassisNumber = 'MALBM51ABC123456';
  const record = {
    status: 'SUCCESS',
    requestedById: 'user-1',
    requestFingerprint: buildChassisVerificationFingerprint(chassisNumber),
  };

  assert.equal(isUsableChassisVerification(record, chassisNumber, 'user-1'), true);
  assert.equal(isUsableChassisVerification(record, 'OTHER123456', 'user-1'), false);
  assert.equal(isUsableChassisVerification(record, chassisNumber, 'user-2'), false);
});

test('rejects failed and missing verification records', () => {
  assert.equal(isUsableChassisVerification(null, 'MALBM51ABC123456', 'user-1'), false);
  assert.equal(isUsableChassisVerification({
    status: 'FAILED',
    requestedById: 'user-1',
    requestFingerprint: buildChassisVerificationFingerprint('MALBM51ABC123456'),
  }, 'MALBM51ABC123456', 'user-1'), false);
});

test('marks a listing API verified when saved values match the provider snapshot', () => {
  const provider = buildProviderListingVerificationSnapshot({
    rc_number: 'PB00AZ1234',
    vehicle_chasi_number: 'MALBM51ABC123456',
    vehicle_engine_number: 'D4FCJM12345',
    vehicle_category_description: 'Motor Car(LMV)',
    maker_description: 'HYUNDAI MOTOR INDIA LTD',
    maker_model: 'I20 SPORTZ CRDI',
    manufacturing_date_formatted: '2018-10',
    registration_date: '2019-01-26',
    owner_number: '2',
    fuel_type: 'DIESEL',
    insurance_upto: '2099-01-20',
    fit_up_to: '2034-01-25',
    tax_paid_upto: '2034-01-25',
    pucc_upto: '2030-01-25',
    registered_at: 'FEROZPUR RTA, Punjab',
    financed: false,
  });
  const current = buildCurrentListingVerificationSnapshot({
    title: 'HYUNDAI MOTOR INDIA LTD I20 SPORTZ CRDI',
    categoryName: 'Motor Car(LMV)',
    brandName: 'HYUNDAI MOTOR INDIA LTD',
    modelName: 'I20 SPORTZ CRDI',
    manufacturingYear: '2018',
    description: [
      'Registration year: 2019',
      'Registration no: PB00AZ1234',
      'Chassis/serial: MALBM51ABC123456',
      'Engine number: D4FCJM12345',
      'Owners: 2',
      'Fuel: Diesel',
    ].join('\n'),
    rtoDetails: {
      hirePurchaseStatus: 'NOT_APPLICABLE',
      taxStatus: 'VALID',
      taxValidUntil: '2034-01-25',
      fitnessStatus: 'VALID',
      fitnessValidUntil: '2034-01-25',
      insuranceStatus: 'VALID',
      insuranceValidUntil: '2099-01-20',
      pucStatus: 'VALID',
      pucValidUntil: '2030-01-25',
      rtoOffice: 'FEROZPUR RTA, Punjab',
    },
  });

  assert.deepEqual(getListingVerificationStatus(provider, current), {
    status: 'API_VERIFIED',
    changedFields: [],
  });
});

test('requires re-verification for identity changes and marks other edits manually modified', () => {
  const provider = buildProviderListingVerificationSnapshot({
    rc_number: 'PB00AZ1234',
    vehicle_chasi_number: 'MALBM51ABC123456',
    vehicle_engine_number: 'D4FCJM12345',
    maker_model: 'I20 SPORTZ CRDI',
  });
  const chassisChanged = { ...provider, chassisNumber: 'OTHER123456' };
  const titleChanged = { ...provider, vehicleName: 'My edited vehicle' };

  assert.deepEqual(getListingVerificationStatus(provider, chassisChanged), {
    status: 'REVERIFICATION_REQUIRED',
    changedFields: ['chassisNumber'],
  });
  assert.deepEqual(getListingVerificationStatus(provider, titleChanged), {
    status: 'MANUALLY_MODIFIED',
    changedFields: ['vehicleName'],
  });
});

test('persists a safe verification summary and audit event without provider payload values', async () => {
  const upsertCalls: Array<Record<string, unknown>> = [];
  const auditCalls: Array<Record<string, unknown>> = [];
  const client = {
    listingVehicleVerification: {
      findUnique: async () => null,
      upsert: async (args: Record<string, unknown>) => {
        upsertCalls.push(args);
        return args.create;
      },
    },
    auditLog: {
      create: async (args: Record<string, unknown>) => {
        auditCalls.push(args);
      },
    },
  };

  await syncListingVehicleVerification(client, {
    listingId: 'listing-1',
    actorUserId: 'user-1',
    verificationRecordId: 'verification-1',
    providerSnapshot: {
      chassisNumber: 'CHASSIS-1',
      engineNumber: 'ENGINE-1',
    },
    currentSnapshot: {
      chassisNumber: 'CHASSIS-1',
      engineNumber: 'ENGINE-1',
    },
  });

  assert.equal(upsertCalls.length, 1);
  const upsertData = upsertCalls[0]!;
  assert.equal((upsertData.create as Record<string, unknown>).status, 'API_VERIFIED');
  assert.equal(auditCalls.length, 1);
  const auditData = auditCalls[0]!.data as Record<string, unknown>;
  assert.deepEqual(auditData.afterJson, {
    status: 'API_VERIFIED',
    changedFields: [],
    verificationRecordId: 'verification-1',
  });
  assert.equal(JSON.stringify(auditData).includes('CHASSIS-1'), false);
  assert.equal(JSON.stringify(auditData).includes('ENGINE-1'), false);
});

test('clears stale verification identity when an edit is saved without a provider snapshot', async () => {
  const upsertCalls: Array<Record<string, unknown>> = [];
  const client = {
    listingVehicleVerification: {
      findUnique: async () => ({
        status: 'API_VERIFIED',
        changedFields: [],
        verificationRecordId: 'old-verification',
        verificationSource: 'CHASSIS',
      }),
      upsert: async (args: Record<string, unknown>) => {
        upsertCalls.push(args);
        return args.update;
      },
    },
  };

  await syncListingVehicleVerification(client, {
    listingId: 'listing-2',
    actorUserId: 'user-2',
    verificationRecordId: null,
    verificationSource: null,
    providerSnapshot: null,
    currentSnapshot: { chassisNumber: 'CHASSIS-2' },
  });

  const updateData = upsertCalls[0]!.update as Record<string, unknown>;
  assert.equal(updateData.verificationRecordId, null);
  assert.equal(updateData.verificationSource, null);
});
