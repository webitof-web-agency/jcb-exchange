import assert from 'node:assert/strict';
import test from 'node:test';
import {
  DrivingLicenseVerificationService,
  normalizeDrivingLicenseVerificationResult,
  maskDrivingLicenseNumber,
} from './drivingLicenseVerification.service';
import { decryptPanData, encryptPanData } from './panVerification.dataCrypto';

const dataSecret = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';

test('normalizes driving-license data without treating provider success as active status', () => {
  assert.equal(maskDrivingLicenseNumber('UP2020150000000'), 'UP20********0000');
  assert.deepEqual(normalizeDrivingLicenseVerificationResult({
    license_number: 'UP2020150000000',
    client_id: 'license-client-1',
    name: ' MUNNA BHAIYA ',
    organ_donor: 'YES',
    hazardous_validity: '2030-01-01',
    hill_validity: '2030-01-01',
    mobile_number: '9876543210',
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
    organDonor: 'YES',
    hazardousValidity: '2030-01-01',
    hillValidity: '2030-01-01',
    mobileNumber: '9876543210',
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

test('persists encrypted driving-license history with the profile image for template rendering', async () => {
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
  const storedResult = JSON.parse(decryptPanData(records[0].encryptedResult, dataSecret)) as Record<string, unknown>;
  assert.equal(storedResult.profileImage, 'data:image/jpeg;base64,private-image');
  assert.deepEqual(auditEvents.map((event) => event.action), [
    'DRIVING_LICENSE_VERIFICATION_REQUESTED',
    'DRIVING_LICENSE_VERIFICATION_SUCCEEDED',
  ]);
});

test('reuses the latest saved record instead of creating a duplicate verification history row', async () => {
  const existingTemplate = {
    id: 'old-template',
    verificationRecordId: 'dl-record-existing',
    driveFileId: 'old-drive-file',
  };
  const existingRecord: any = {
    id: 'dl-record-existing',
    status: 'SUCCESS',
    maskedLicenseNumber: 'UP20********0000',
    requestFingerprint: 'fingerprint',
    requestedById: 'user-1',
    encryptedResult: null,
    rawDataExpiresAt: null,
    template: existingTemplate,
    provider: 'SUREPASS',
    createdAt: new Date('2026-10-30T10:00:00.000Z'),
    completedAt: new Date('2026-10-30T10:01:00.000Z'),
  };
  let findFirstCalls = 0;
  let createCalls = 0;
  const deletedTemplateIds: string[] = [];
  const deletedDriveFileIds: string[] = [];
  const updates: Array<Record<string, unknown>> = [];
  const service = new DrivingLicenseVerificationService({
    record: {
      findFirst: async () => {
        findFirstCalls += 1;
        if (findFirstCalls === 3) return existingRecord;
        return null;
      },
      findUnique: async () => null,
      findMany: async () => [],
      count: async () => 0,
      create: async () => {
        createCalls += 1;
        throw new Error('duplicate verification row must not be created');
      },
      update: async ({ data }: { data: Record<string, unknown> }) => {
        updates.push(data);
        Object.assign(existingRecord, data);
        return { ...existingRecord, template: null, requestedBy: null };
      },
    },
    template: {
      delete: async ({ where }: { where: { id: string } }) => {
        deletedTemplateIds.push(where.id);
        existingRecord.template = null;
        return existingTemplate;
      },
    } as any,
    provider: {
      verifyDrivingLicense: async () => ({
        success: true,
        status_code: 200,
        message_code: 'success',
        data: { license_number: 'UP2020150000000', name: 'MUNNA BHAIYA', has_image: false },
      }),
    } as any,
    dataSecret,
    deleteTemplateFile: async (fileId) => { deletedDriveFileIds.push(fileId); },
  });

  const result = await service.verifyDrivingLicense({ id_number: 'UP2020150000000', dob: '1996-11-23' }, 'user-1');

  assert.equal(result.record.id, existingRecord.id);
  assert.equal(createCalls, 0);
  assert.deepEqual(deletedTemplateIds, ['old-template']);
  assert.deepEqual(deletedDriveFileIds, ['old-drive-file']);
  assert.equal(updates[0]?.status, 'PENDING');
});

test('history lists only driving-license records with an uploaded template', async () => {
  let receivedWhere: Record<string, unknown> | null = null;
  const service = new DrivingLicenseVerificationService({
    record: {
      findFirst: async () => null,
      findUnique: async () => null,
      count: async ({ where }: { where: Record<string, unknown> }) => {
        receivedWhere = where;
        return 1;
      },
      findMany: async ({ where }: { where: Record<string, unknown> }) => {
        receivedWhere = where;
        return [{
          id: 'dl-record-with-template',
          status: 'SUCCESS',
          maskedLicenseNumber: 'UP20********0000',
          provider: 'SUREPASS',
          template: {
            id: 'dl-template-1',
            fileName: 'driving-license-template.png',
            mimeType: 'image/png',
            fileSize: 128,
            sha256: 'hash',
            createdAt: new Date('2026-10-31T10:00:00.000Z'),
          },
          createdAt: new Date('2026-10-31T09:00:00.000Z'),
          completedAt: new Date('2026-10-31T09:01:00.000Z'),
        }];
      },
      create: async () => { throw new Error('must not create a record'); },
      update: async () => { throw new Error('must not update a record'); },
    },
    dataSecret,
  });

  const result = await service.listHistory({});

  assert.deepEqual(receivedWhere, { template: { isNot: null } });
  assert.equal(result.records[0]?.template?.id, 'dl-template-1');
});

test('history keeps only the latest saved record for the same user and verification fingerprint', async () => {
  const baseRecord = {
    status: 'SUCCESS',
    maskedLicenseNumber: 'UP20********0000',
    provider: 'SUREPASS',
    requestedById: 'user-1',
    requestFingerprint: 'same-fingerprint',
    template: { id: 'template', fileName: 'latest.png', mimeType: 'image/png', fileSize: 128, sha256: 'hash', createdAt: new Date() },
  };
  const service = new DrivingLicenseVerificationService({
    record: {
      findFirst: async () => null,
      findUnique: async () => null,
      count: async () => 2,
      findMany: async () => [
        { ...baseRecord, id: 'latest-record', createdAt: new Date('2026-11-02T10:00:00.000Z') },
        { ...baseRecord, id: 'older-record', template: { ...baseRecord.template, id: 'older-template' }, createdAt: new Date('2026-11-01T10:00:00.000Z') },
      ],
      create: async () => ({}),
      update: async () => ({}),
    },
    dataSecret,
  });

  const result = await service.listHistory({});

  assert.equal(result.records.length, 1);
  assert.equal(result.records[0]?.id, 'latest-record');
});

test('does not reuse a cached result that says a profile image exists but has no stored image', async () => {
  const cachedRecord = {
    id: 'dl-record-with-missing-image',
    status: 'SUCCESS',
    maskedLicenseNumber: 'UP20********0000',
    provider: 'SUREPASS',
    encryptedResult: encryptPanData(JSON.stringify({ licenseNumber: 'UP2020150000000', hasImage: true }), dataSecret),
    rawDataExpiresAt: new Date(Date.now() + 60_000),
    completedAt: new Date(),
    createdAt: new Date(),
    template: null,
  };
  const service = new DrivingLicenseVerificationService({
    record: { findFirst: async () => cachedRecord } as any,
    dataSecret,
  });

  const cached = await (service as any).findFreshCachedResult('fingerprint', dataSecret);
  assert.equal(cached, null);
});
