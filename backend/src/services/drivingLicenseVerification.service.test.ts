import assert from 'node:assert/strict';
import test from 'node:test';
import {
  DrivingLicenseVerificationService,
  normalizeDrivingLicenseVerificationResult,
  maskDrivingLicenseNumber,
} from './drivingLicenseVerification.service';

const dataSecret = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';

test('normalizes driving-license data without treating provider success as active status', () => {
  assert.equal(maskDrivingLicenseNumber('UP2020150000000'), 'UP20********0000');
  assert.deepEqual(normalizeDrivingLicenseVerificationResult({
    license_number: 'UP2020150000000',
    client_id: 'license-client-1',
    name: ' MUNNA BHAIYA ',
    current_status: null,
    transport_doi: '1800-01-01',
    transport_doe: '1800-01-01',
    vehicle_classes: ['MCWG', 4, ''],
    vehicle_class_description: [{ class: 'Motorcycle' }, ''],
    additional_check: [{ name: 'address', status: 'pass' }],
    less_info: true,
    profile_image: 'should-not-be-persisted',
  }), {
    licenseNumber: 'UP2020150000000',
    providerClientId: 'license-client-1',
    name: 'MUNNA BHAIYA',
    currentStatus: null,
    vehicleClasses: ['MCWG'],
    vehicleClassDescriptions: [{ class: 'Motorcycle' }],
    additionalChecks: [{ name: 'address', status: 'pass' }],
    lessInfo: true,
  });
});

test('does not call Surepass for invalid driving-license input', async () => {
  let calls = 0;
  const service = new DrivingLicenseVerificationService({
    record: {
      findFirst: async () => null,
      findUnique: async () => null,
      findMany: async () => [],
      count: async () => 0,
      create: async () => { throw new Error('must not create a record'); },
      update: async () => { throw new Error('must not update a record'); },
    },
    provider: { verifyDrivingLicense: async () => { calls += 1; return {}; } } as any,
    dataSecret,
  });

  await assert.rejects(
    () => service.verifyDrivingLicense({ id_number: 'DL<script>', dob: '1996-01-01' }, 'user-1'),
    { statusCode: 400 },
  );
  assert.equal(calls, 0);
});

test('persists encrypted driving-license history and excludes profile image from stored result', async () => {
  const records: any[] = [];
  const auditEvents: Array<Record<string, unknown>> = [];
  let payload: Record<string, unknown> | null = null;
  const recordRepository = {
    findFirst: async () => null,
    findUnique: async () => null,
    findMany: async () => records,
    count: async () => records.length,
    create: async ({ data }: { data: Record<string, unknown> }) => {
      const record = { id: 'dl-record-1', ...data, provider: 'SUREPASS', providerClientId: null, messageCode: null, safeMessage: null, encryptedResult: null, createdAt: new Date(), completedAt: null };
      records.push(record);
      return record;
    },
    update: async ({ data }: { where: { id: string }; data: Record<string, unknown> }) => {
      Object.assign(records[0], data);
      return records[0];
    },
  };
  const service = new DrivingLicenseVerificationService({
    record: recordRepository,
    audit: { create: async ({ data }: { data: Record<string, unknown> }) => { auditEvents.push(data); } },
    provider: {
      verifyDrivingLicense: async (request: Record<string, unknown>) => {
        payload = request;
        return {
          success: true,
          status_code: 200,
          message_code: 'success',
          data: {
            client_id: 'license-client-1',
            license_number: 'UP2020150000000',
            name: 'MUNNA BHAIYA',
            state: 'Uttar Pradesh',
            current_status: null,
            profile_image: 'data:image/jpeg;base64,private-image',
            less_info: false,
          },
        };
      },
    } as any,
    dataSecret,
  });

  const result = await service.verifyDrivingLicense({ id_number: ' up2020150000000 ', dob: '23/11/1996' }, 'user-1');
  assert.deepEqual(payload, { id_number: 'UP2020150000000', dob: '1996-11-23' });
  assert.equal(result.record.status, 'SUCCESS');
  assert.equal(result.record.currentStatus, null);
  assert.equal((result.result as Record<string, unknown>).profileImage, 'data:image/jpeg;base64,private-image');
  assert.equal(records[0].encryptedResult.includes('private-image'), false);
  assert.deepEqual(auditEvents.map((event) => event.action), [
    'DRIVING_LICENSE_VERIFICATION_REQUESTED',
    'DRIVING_LICENSE_VERIFICATION_SUCCEEDED',
  ]);
});
