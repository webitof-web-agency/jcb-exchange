import assert from 'node:assert/strict';
import test from 'node:test';

import { RcOwnerHistoryService } from './rcOwnerHistory.service';

const dataSecret = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
const validPng = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

test('successful RC owner-history template upload stores the template and clears raw result data', async () => {
  const record = {
    id: 'rc-owner-record-1',
    serviceKey: 'RC_OWNER_HISTORY',
    status: 'SUCCESS',
    maskedRcNumber: 'GJ01********8123',
    requestedById: 'user-1',
    encryptedResult: 'encrypted-result',
    rawDataExpiresAt: new Date(Date.now() + 60_000),
    ephemeralExpiresAt: new Date(Date.now() + 15 * 60_000),
    template: null,
  };
  const updates: Record<string, unknown>[] = [];
  let uploadCalls = 0;
  const template = {
    id: 'rc-owner-template-1',
    verificationRecordId: record.id,
    driveFileId: 'drive-file-1',
    fileName: 'rc-owner-history-template-GJ01-8123.png',
    mimeType: 'image/png',
    fileSize: validPng.length,
    sha256: 'hash',
    createdAt: new Date(),
  };
  const service = new RcOwnerHistoryService({
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
  assert.deepEqual(updates, [{ encryptedResult: null, rawDataExpiresAt: null, ephemeralExpiresAt: null }]);
});

test('RC owner-history upload reuses an existing saved template for the same masked RC', async () => {
  const currentRecord = {
    id: 'rc-owner-record-current',
    serviceKey: 'RC_OWNER_HISTORY',
    status: 'SUCCESS',
    maskedRcNumber: 'GJ01********8123',
    requestedById: 'user-1',
    encryptedResult: 'encrypted-result',
    rawDataExpiresAt: new Date(Date.now() + 60_000),
    ephemeralExpiresAt: new Date(Date.now() + 15 * 60_000),
    template: null,
  };
  const existingTemplate = {
    id: 'rc-owner-template-existing',
    verificationRecordId: 'rc-owner-record-existing',
    driveFileId: 'drive-file-existing',
    fileName: 'rc-owner-history-template-GJ01-8123.png',
    mimeType: 'image/png',
    fileSize: validPng.length,
    sha256: 'existing-hash',
    createdAt: new Date(),
  };
  const existingRecord = {
    ...currentRecord,
    id: 'rc-owner-record-existing',
    encryptedResult: null,
    rawDataExpiresAt: null,
    ephemeralExpiresAt: null,
    template: existingTemplate,
  };
  let uploadCalls = 0;
  const updates: Record<string, unknown>[] = [];
  const service = new RcOwnerHistoryService({
    record: {
      findFirst: async () => existingRecord,
      findUnique: async () => currentRecord,
      findMany: async () => [],
      count: async () => 0,
      create: async () => null,
      update: async ({ data }: { data: Record<string, unknown> }) => {
        updates.push(data);
        return currentRecord;
      },
    },
    template: { create: async () => { throw new Error('must not create a duplicate template'); } } as any,
    dataSecret,
    uploadTemplateFile: async () => {
      uploadCalls += 1;
      return { fileId: 'duplicate-drive-file' };
    },
  } as any);

  const result = await (service as any).uploadTemplate(
    currentRecord.id,
    'user-1',
    'EMPLOYEE',
    validPng,
    'image/png',
  );

  assert.equal(uploadCalls, 0);
  assert.equal(result.record.id, existingRecord.id);
  assert.equal(result.template.id, existingTemplate.id);
  assert.equal(result.alreadyUploaded, true);
  assert.deepEqual(updates, [{ encryptedResult: null, rawDataExpiresAt: null, ephemeralExpiresAt: null }]);
});

test('RC owner-history history only queries records with a saved template', async () => {
  let countWhere: Record<string, unknown> | null = null;
  let findManyWhere: Record<string, unknown> | null = null;
  const service = new RcOwnerHistoryService({
    record: {
      findFirst: async () => null,
      findUnique: async () => null,
      findMany: async ({ where }: { where: Record<string, unknown> }) => {
        findManyWhere = where;
        return [];
      },
      count: async ({ where }: { where: Record<string, unknown> }) => {
        countWhere = where;
        return 0;
      },
      create: async () => null,
      update: async () => null,
    },
    dataSecret,
  });

  await service.listHistory({ page: 1, limit: 20 });

  assert.deepEqual(countWhere, { serviceKey: 'RC_OWNER_HISTORY', template: { isNot: null } });
  assert.deepEqual(findManyWhere, { serviceKey: 'RC_OWNER_HISTORY', template: { isNot: null } });
});

test('RC owner-history history returns only the newest saved template per masked RC', async () => {
  const older = {
    id: 'rc-owner-record-old',
    serviceKey: 'RC_OWNER_HISTORY',
    status: 'SUCCESS',
    maskedRcNumber: 'CG04********3874',
    createdAt: new Date('2026-10-29T10:00:00.000Z'),
    template: { id: 'template-old', fileSize: 10, sha256: 'old', createdAt: new Date('2026-10-29T10:00:01.000Z') },
  };
  const newest = {
    ...older,
    id: 'rc-owner-record-new',
    createdAt: new Date('2026-10-29T11:00:00.000Z'),
    template: { id: 'template-new', fileSize: 20, sha256: 'new', createdAt: new Date('2026-10-29T11:00:01.000Z') },
  };
  const service = new RcOwnerHistoryService({
    record: {
      findFirst: async () => null,
      findUnique: async () => null,
      findMany: async () => [newest, older],
      count: async () => 2,
      groupBy: async () => [{ maskedRcNumber: 'CG04********3874' }],
      create: async () => null,
      update: async () => null,
    } as any,
    dataSecret,
  } as any);

  const result = await service.listHistory({ page: 1, limit: 20 });

  assert.equal(result.records.length, 1);
  const [visibleRecord] = result.records;
  assert.ok(visibleRecord);
  assert.equal(visibleRecord.id, 'rc-owner-record-new');
  assert.equal(result.pagination.total, 1);
  assert.equal(result.pagination.totalPages, 1);
});

test('RC owner-history cleanup deletes expired unsaved sessions and clears expired raw data', async () => {
  let deleteWhere: Record<string, unknown> | null = null;
  let updateWhere: Record<string, unknown> | null = null;
  const service = new RcOwnerHistoryService({
    record: {
      findFirst: async () => null,
      findUnique: async () => null,
      findMany: async () => [],
      count: async () => 0,
      create: async () => null,
      update: async () => null,
      deleteMany: async ({ where }: { where: Record<string, unknown> }) => {
        deleteWhere = where;
        return { count: 2 };
      },
      updateMany: async ({ where }: { where: Record<string, unknown> }) => {
        updateWhere = where;
        return { count: 3 };
      },
    } as any,
    dataSecret,
  });

  const now = new Date('2026-10-29T12:00:00.000Z');
  assert.equal(await service.cleanupExpiredRawData(now), 5);
  assert.deepEqual(deleteWhere, {
    serviceKey: 'RC_OWNER_HISTORY',
    template: { is: null },
    ephemeralExpiresAt: { lte: now },
  });
  assert.deepEqual(updateWhere, {
    serviceKey: 'RC_OWNER_HISTORY',
    status: 'SUCCESS',
    encryptedResult: { not: null },
    OR: [
      { rawDataExpiresAt: null },
      { rawDataExpiresAt: { lte: now } },
    ],
  });
});
