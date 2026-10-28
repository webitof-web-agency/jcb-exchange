import assert from 'node:assert/strict';
import test from 'node:test';

import {
  AadhaarVerificationService,
  getAadhaarRawDataExpiresAt,
  isAadhaarRawDataAvailable,
} from './aadhaarVerification.service';

const validPng = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

const baseRecord = (overrides: Record<string, unknown> = {}) => ({
  id: 'aadhaar-record-1',
  side: 'SALE',
  status: 'SUCCESS',
  maskedAadhaar: 'XXXXXXXX1231',
  provider: 'SUREPASS',
  providerClientId: 'client-1',
  messageCode: null,
  safeMessage: null,
  encryptedResult: 'encrypted-result',
  rawDataExpiresAt: new Date('2026-10-28T10:05:00.000Z'),
  requestedById: 'user-1',
  createdAt: new Date('2026-10-28T10:00:00.000Z'),
  completedAt: new Date('2026-10-28T10:00:00.000Z'),
  template: null,
  ...overrides,
});

test('Aadhaar raw-data expiry is exactly five minutes after completion', () => {
  const completedAt = new Date('2026-10-28T10:00:00.000Z');
  assert.equal(getAadhaarRawDataExpiresAt(completedAt).toISOString(), '2026-10-28T10:05:00.000Z');
  assert.equal(isAadhaarRawDataAvailable(baseRecord(), new Date('2026-10-28T10:04:59.999Z').getTime()), true);
  assert.equal(isAadhaarRawDataAvailable(baseRecord(), new Date('2026-10-28T10:05:00.000Z').getTime()), false);
});

test('successful Aadhaar record can still save the generated template after raw-data cleanup', async () => {
  const record = baseRecord({ rawDataExpiresAt: new Date('2020-01-01T00:00:00.000Z') });
  let uploadCalls = 0;
  const template = {
    id: 'aadhaar-template-expired-window',
    fileName: 'aadhaar-template-aadhaar-record-1.png',
    mimeType: 'image/png',
    fileSize: validPng.length,
    sha256: 'hash',
    createdAt: new Date('2026-10-28T10:01:00.000Z'),
  };
  const service = new AadhaarVerificationService({
    record: {
      findUnique: async () => record,
      update: async () => record,
    } as any,
    template: { findUnique: async () => null, create: async () => template } as any,
    dataSecret: 'test-secret',
    uploadTemplateFile: async () => {
      uploadCalls += 1;
      return { fileId: 'drive-file' };
    },
  });

  const result = await service.uploadTemplate(record.id, 'user-1', 'EMPLOYEE', validPng, 'image/png');
  assert.equal(result.template?.id, template.id);
  assert.equal(uploadCalls, 1);
});

test('successful Aadhaar template upload saves metadata and clears only encrypted raw data', async () => {
  const record = baseRecord();
  const updates: Record<string, unknown>[] = [];
  const template = {
    id: 'aadhaar-template-1',
    verificationRecordId: record.id,
    driveFileId: 'drive-file-1',
    fileName: 'aadhaar-template-aadhaar-record-1.png',
    mimeType: 'image/png',
    fileSize: validPng.length,
    sha256: 'hash',
    createdAt: new Date('2026-10-28T10:01:00.000Z'),
  };
  const service = new AadhaarVerificationService({
    record: {
      findUnique: async () => record,
      update: async ({ data }: { data: Record<string, unknown> }) => {
        updates.push(data);
        return { ...record, ...data, template };
      },
    } as any,
    template: {
      create: async () => template,
      delete: async () => template,
    } as any,
    dataSecret: 'test-secret',
    uploadTemplateFile: async (buffer, mimeType, filename) => {
      assert.deepEqual(buffer, validPng);
      assert.equal(mimeType, 'image/png');
      assert.equal(filename, 'aadhaar-template-aadhaar-record-1.png');
      return { fileId: 'drive-file-1' };
    },
  });

  const result = await service.uploadTemplate(record.id, 'user-1', 'EMPLOYEE', validPng, 'image/png');
  assert.equal(result.result, null);
  assert.equal(result.template?.id, template.id);
  assert.deepEqual(updates, [{ encryptedResult: null, rawDataExpiresAt: null }]);
});

test('Aadhaar template upload preserves a safe complete-number filename supplied by the authorized UI', async () => {
  const record = baseRecord();
  const template = {
    id: 'aadhaar-template-filename',
    fileName: 'aadhaar-123456789012-meghraj.png',
    mimeType: 'image/png',
    fileSize: validPng.length,
    sha256: 'hash',
    createdAt: new Date('2026-10-28T10:01:00.000Z'),
  };
  let uploadedFilename = '';
  const service = new AadhaarVerificationService({
    record: {
      findUnique: async () => record,
      update: async () => record,
    } as any,
    template: { create: async () => template } as any,
    dataSecret: 'test-secret',
    uploadTemplateFile: async (_buffer, _mimeType, filename) => {
      uploadedFilename = filename;
      return { fileId: 'drive-file-filename' };
    },
  });

  await service.uploadTemplate(record.id, 'user-1', 'EMPLOYEE', validPng, 'image/png', template.fileName);
  assert.equal(uploadedFilename, template.fileName);
});

test('Aadhaar history returns saved template metadata and scopes employee records', async () => {
  const record = baseRecord({ template: {
    id: 'aadhaar-template-1',
    fileName: 'aadhaar-template.png',
    mimeType: 'image/png',
    fileSize: validPng.length,
    sha256: 'hash',
    createdAt: new Date('2026-10-28T10:01:00.000Z'),
  } });
  let countWhere: Record<string, unknown> | undefined;
  let findWhere: Record<string, unknown> | undefined;
  const service = new AadhaarVerificationService({
    record: {
      count: async ({ where }: { where: Record<string, unknown> }) => { countWhere = where; return 1; },
      findMany: async ({ where }: { where: Record<string, unknown> }) => { findWhere = where; return [record]; },
    } as any,
    dataSecret: 'test-secret',
  });

  const result = await service.listHistory({ page: 1, limit: 20 }, 'user-1', 'EMPLOYEE');
  assert.equal(result.records[0]?.template?.id, 'aadhaar-template-1');
  assert.deepEqual(countWhere, { requestedById: 'user-1' });
  assert.deepEqual(findWhere, { requestedById: 'user-1' });
});
