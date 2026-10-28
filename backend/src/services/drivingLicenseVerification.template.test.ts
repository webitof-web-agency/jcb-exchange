import assert from 'node:assert/strict';
import test from 'node:test';

import { DrivingLicenseVerificationService } from './drivingLicenseVerification.service';

const dataSecret = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
const validPng = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

test('successful driving-license template upload stores the template and clears raw result data', async () => {
  const record = {
    id: 'dl-record-1',
    status: 'SUCCESS',
    maskedLicenseNumber: 'UP20********0000',
    requestedById: 'user-1',
    encryptedResult: 'encrypted-result',
    rawDataExpiresAt: new Date(Date.now() + 60_000),
    template: null,
  };
  const updates: Record<string, unknown>[] = [];
  let uploadCalls = 0;
  const template = {
    id: 'dl-template-1',
    verificationRecordId: record.id,
    driveFileId: 'drive-file-1',
    fileName: 'driving-license-template-UP20-0000.png',
    mimeType: 'image/png',
    fileSize: validPng.length,
    sha256: 'hash',
    createdAt: new Date('2026-10-28T10:01:00.000Z'),
  };
  const service = new DrivingLicenseVerificationService({
    record: {
      findFirst: async () => null,
      findUnique: async () => record,
      findMany: async () => [],
      count: async () => 0,
      create: async () => record,
      update: async ({ data }: { data: Record<string, unknown> }) => {
        updates.push(data);
        return { ...record, ...data, template };
      },
    },
    template: {
      create: async () => template,
      delete: async () => template,
    } as any,
    dataSecret,
    uploadTemplateFile: async () => {
      uploadCalls += 1;
      return { fileId: 'drive-file-1' };
    },
  } as any);

  const result = await (service as any).uploadTemplate(
    record.id,
    'user-1',
    'EMPLOYEE',
    validPng,
    'image/png',
  );

  assert.equal(uploadCalls, 1);
  assert.equal(result.result, null);
  assert.equal(result.template.id, template.id);
  assert.deepEqual(updates, [{ encryptedResult: null, rawDataExpiresAt: null }]);
});

test('repeated driving-license template upload is idempotent and does not create another Drive file', async () => {
  const template = {
    id: 'dl-template-existing',
    verificationRecordId: 'dl-record-existing',
    driveFileId: 'drive-file-existing',
    fileName: 'driving-license-template-UP20-0000.png',
    mimeType: 'image/png',
    fileSize: validPng.length,
    sha256: 'hash',
    createdAt: new Date(),
  };
  let uploadCalls = 0;
  const updates: Record<string, unknown>[] = [];
  const service = new DrivingLicenseVerificationService({
    record: {
      findFirst: async () => null,
      findUnique: async () => ({
        id: template.verificationRecordId,
        status: 'SUCCESS',
        maskedLicenseNumber: 'UP20********0000',
        requestedById: 'user-1',
        encryptedResult: 'stale-encrypted-result',
        rawDataExpiresAt: new Date(Date.now() + 60_000),
        template,
      }),
      findMany: async () => [],
      count: async () => 0,
      create: async () => ({}),
      update: async ({ data }: { data: Record<string, unknown> }) => {
        updates.push(data);
        return {};
      },
    },
    template: { create: async () => template } as any,
    dataSecret,
    uploadTemplateFile: async () => {
      uploadCalls += 1;
      return { fileId: 'should-not-be-created' };
    },
  } as any);

  const result = await (service as any).uploadTemplate(
    template.verificationRecordId,
    'user-1',
    'EMPLOYEE',
    validPng,
    'image/png',
  );

  assert.equal(uploadCalls, 0);
  assert.equal(result.alreadyUploaded, true);
  assert.equal(result.template.id, template.id);
  assert.deepEqual(updates, [{ encryptedResult: null, rawDataExpiresAt: null }]);
});

test('expired driving-license raw result cleanup clears only retained encrypted results', async () => {
  let cleanupArgs: Record<string, unknown> | null = null;
  const service = new DrivingLicenseVerificationService({
    record: {
      findFirst: async () => null,
      findUnique: async () => null,
      findMany: async () => [],
      count: async () => 0,
      create: async () => ({}),
      update: async () => ({}),
      updateMany: async (args: { where: Record<string, unknown>; data: Record<string, unknown> }) => {
        cleanupArgs = args;
        return { count: 2 };
      },
    },
    dataSecret,
  } as any);

  const count = await service.cleanupExpiredRawData(new Date('2026-10-28T10:05:00.000Z'));

  assert.equal(count, 2);
  const capturedCleanupArgs = cleanupArgs as unknown as { where: Record<string, unknown>; data: Record<string, unknown> };
  assert.deepEqual(capturedCleanupArgs.data, { encryptedResult: null, rawDataExpiresAt: null });
  assert.deepEqual(capturedCleanupArgs.where, {
    status: 'SUCCESS',
    encryptedResult: { not: null },
    OR: [
      { rawDataExpiresAt: null },
      { rawDataExpiresAt: { lte: new Date('2026-10-28T10:05:00.000Z') } },
    ],
  });
});
