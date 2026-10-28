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
  assert.deepEqual(updates, [{ encryptedResult: null, rawDataExpiresAt: null }]);
});
