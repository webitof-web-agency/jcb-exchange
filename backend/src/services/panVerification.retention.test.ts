import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  PAN_RAW_DATA_TTL_MS,
  PanVerificationError,
  PanVerificationService,
  getPanRawDataExpiresAt,
  isPanRawDataAvailable,
} from './panVerification.service';

const secret = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
const validPng = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

test('PAN raw-data expiry is exactly five minutes after completion', () => {
  const completedAt = new Date('2026-10-27T10:00:00.000Z');
  assert.equal(getPanRawDataExpiresAt(completedAt).toISOString(), '2026-10-27T10:05:00.000Z');
  assert.equal(PAN_RAW_DATA_TTL_MS, 5 * 60 * 1000);
});

test('expired or legacy PAN records are never considered available for template generation', () => {
  const now = Date.parse('2026-10-27T10:05:00.000Z');
  assert.equal(isPanRawDataAvailable({ encryptedResult: 'cipher', rawDataExpiresAt: new Date(now + 1) }, now), true);
  assert.equal(isPanRawDataAvailable({ encryptedResult: 'cipher', rawDataExpiresAt: new Date(now) }, now), false);
  assert.equal(isPanRawDataAvailable({ encryptedResult: 'cipher', rawDataExpiresAt: null }, now), false);
  assert.equal(isPanRawDataAvailable({ encryptedResult: null, rawDataExpiresAt: new Date(now + 1) }, now), false);
});

test('template upload is rejected after the raw-data window and does not call storage', async () => {
  let storageCalls = 0;
  const service = new PanVerificationService({
    record: {
      findFirst: async () => null,
      findUnique: async () => ({
        id: 'record-1',
        status: 'SUCCESS',
        requestedById: 'user-1',
        encryptedResult: 'cipher',
        rawDataExpiresAt: new Date(Date.now() - 1),
        template: null,
      }),
      findMany: async () => [],
      count: async () => 0,
      create: async () => null,
      update: async () => null,
    },
    template: {
      findUnique: async () => null,
      create: async () => null,
    },
    dataSecret: secret,
    uploadTemplateFile: async () => {
      storageCalls += 1;
      return { fileId: 'drive-file-1' };
    },
  });

  await assert.rejects(
    () => service.uploadTemplate('record-1', 'user-1', 'EMPLOYEE', validPng, 'image/png'),
    (error: unknown) => error instanceof PanVerificationError
      && error.statusCode === 410
      && error.code === 'pan_raw_data_expired',
  );
  assert.equal(storageCalls, 0);
});

test('successful template upload stores only private artifact metadata and clears raw PAN data', async () => {
  const updates: Record<string, unknown>[] = [];
  const templateCreates: Record<string, unknown>[] = [];
  const service = new PanVerificationService({
    record: {
      findFirst: async () => null,
      findUnique: async () => ({
        id: 'record-1',
        status: 'SUCCESS',
        requestedById: 'user-1',
        encryptedResult: 'cipher',
        rawDataExpiresAt: new Date(Date.now() + 60_000),
        template: null,
      }),
      findMany: async () => [],
      count: async () => 0,
      create: async () => null,
      update: async ({ data }: { data: Record<string, unknown> }) => {
        updates.push(data);
        return { id: 'record-1', ...data };
      },
    },
    template: {
      findUnique: async () => null,
      create: async ({ data }: { data: Record<string, unknown> }) => {
        templateCreates.push(data);
        return {
          id: 'template-1',
          ...data,
          createdAt: new Date('2026-10-27T10:01:00.000Z'),
        };
      },
    },
    dataSecret: secret,
    uploadTemplateFile: async (buffer: Buffer, mimeType: string, filename: string) => {
      assert.deepEqual(buffer, validPng);
      assert.equal(mimeType, 'image/png');
      assert.equal(filename, 'pan-template-record-1.png');
      return { fileId: 'drive-file-1' };
    },
  });

  const result = await service.uploadTemplate('record-1', 'user-1', 'EMPLOYEE', validPng, 'image/png');

  assert.ok(result.template);
  assert.equal(result.template.id, 'template-1');
  assert.deepEqual(
    {
      ...templateCreates[0],
      sha256: undefined,
    },
    {
      verificationRecordId: 'record-1',
      requestedById: 'user-1',
      driveFileId: 'drive-file-1',
      fileName: 'pan-template-record-1.png',
      mimeType: 'image/png',
      fileSize: validPng.length,
      sha256: undefined,
    },
  );
  assert.match(String(templateCreates[0]?.sha256), /^[a-f0-9]{64}$/);
  assert.deepEqual(updates[0], { encryptedResult: null, rawDataExpiresAt: null });
});

test('scheduled cleanup removes expired encrypted PAN payloads', async () => {
  let cleanupArgs: Record<string, unknown> | null = null;
  const service = new PanVerificationService({
    record: {
      findFirst: async () => null,
      findUnique: async () => null,
      findMany: async () => [],
      count: async () => 0,
      create: async () => null,
      update: async () => null,
      updateMany: async (args: Record<string, unknown>) => {
        cleanupArgs = args;
        return { count: 2 };
      },
    },
    dataSecret: secret,
  });

  assert.equal(await service.cleanupExpiredRawData(new Date('2026-10-27T10:05:00.000Z')), 2);
  assert.deepEqual((cleanupArgs as unknown as Record<string, any>).data, { encryptedResult: null, rawDataExpiresAt: null });
});
