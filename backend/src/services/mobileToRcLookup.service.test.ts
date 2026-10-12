import assert from 'node:assert/strict';
import test from 'node:test';

import { MobileToRcLookupService, maskMobileNumber } from './mobileToRcLookup.service';

const dataSecret = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';

test('masks the mobile number before it is exposed in history', () => {
  assert.equal(maskMobileNumber('8908885858'), '******5858');
});

test('calls Mobile To RC endpoint and encrypts the returned RC list', async () => {
  const records: any[] = [];
  const auditEvents: Array<Record<string, unknown>> = [];
  let payload: Record<string, unknown> | null = null;
  const recordRepository = {
    findFirst: async () => null,
    findUnique: async () => null,
    findMany: async () => records,
    count: async () => records.length,
    create: async ({ data }: { data: Record<string, unknown> }) => {
      const record = {
        id: 'mobile-to-rc-record-1',
        ...data,
        provider: 'SUREPASS',
        providerClientId: null,
        messageCode: null,
        safeMessage: null,
        encryptedResult: null,
        createdAt: new Date(),
        completedAt: null,
      };
      records.push(record);
      return record;
    },
    update: async ({ data }: { where: { id: string }; data: Record<string, unknown> }) => {
      Object.assign(records[0], data);
      return records[0];
    },
  };

  const service = new MobileToRcLookupService({
    record: recordRepository,
    audit: { create: async ({ data }: { data: Record<string, unknown> }) => { auditEvents.push(data); } },
    provider: {
      verifyMobileToRc: async (request: Record<string, unknown>) => {
        payload = request;
        return {
          success: true,
          status_code: 200,
          message_code: 'success',
          data: {
            client_id: 'mobile-to-rc-client-1',
            mobile_number: '8908885858',
            rc_number: ['RJ14XJ1234', 'DL01AB9999'],
          },
        };
      },
    } as any,
    dataSecret,
  });

  const result = await service.lookupMobileToRc({ mobile_number: ' +91 89088 85858 ' }, 'user-1');
  assert.deepEqual(payload, { mobile_number: '8908885858' });
  assert.equal(result.record.status, 'SUCCESS');
  assert.equal(result.record.maskedMobileNumber, '******5858');
  assert.equal(result.record.rcNumbersCount, 2);
  assert.deepEqual((result.result as Record<string, unknown>).rcNumbers, ['RJ14XJ1234', 'DL01AB9999']);
  assert.equal(records[0].encryptedResult.includes('RJ14XJ1234'), false);
  assert.deepEqual(auditEvents.map((event) => event.action), [
    'MOBILE_TO_RC_LOOKUP_REQUESTED',
    'MOBILE_TO_RC_LOOKUP_SUCCEEDED',
  ]);
});

test('reuses the same successful Mobile To RC record inside the 24-hour cache window', async () => {
  const records: any[] = [];
  let providerCalls = 0;
  const recordRepository = {
    findFirst: async ({ where }: { where: Record<string, unknown> }) => {
      if (where.status === 'SUCCESS') return records[0] || null;
      if (where.status === 'PENDING') return null;
      return records[0] || null;
    },
    findUnique: async () => null,
    findMany: async () => records,
    count: async () => records.length,
    create: async ({ data }: { data: Record<string, unknown> }) => {
      const record = {
        id: 'mobile-to-rc-cache-1',
        ...data,
        provider: 'SUREPASS',
        providerClientId: null,
        messageCode: null,
        safeMessage: null,
        encryptedResult: null,
        createdAt: new Date(),
        completedAt: null,
      };
      records.push(record);
      return record;
    },
    update: async ({ data }: { where: { id: string }; data: Record<string, unknown> }) => {
      Object.assign(records[0], data);
      return records[0];
    },
  };
  const service = new MobileToRcLookupService({
    record: recordRepository,
    provider: {
      verifyMobileToRc: async () => {
        providerCalls += 1;
        return { success: true, status_code: 200, data: { client_id: 'cache-client', mobile_number: '8908885858', rc_number: ['RJ14XJ1234'] } };
      },
    } as any,
    dataSecret,
  });

  const first = await service.lookupMobileToRc({ mobile_number: '8908885858' }, 'user-1');
  const second = await service.lookupMobileToRc({ mobile_number: '+91 8908885858' }, 'user-1');
  assert.equal(first.cacheHit, false);
  assert.equal(second.cacheHit, true);
  assert.equal(second.record.id, first.record.id);
  assert.equal(providerCalls, 1);
  assert.equal(records.length, 1);
});
