import assert from 'node:assert/strict';
import test from 'node:test';

import { RcMobileNumberCheckService, maskMobileNumber } from './rcMobileNumberCheck.service';

const dataSecret = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';

test('masks the mobile number before it is exposed in history', () => {
  assert.equal(maskMobileNumber('9999000123'), '******0123');
});

test('calls RC Mobile Number Check endpoint and encrypts the match result', async () => {
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
        id: 'rc-mobile-check-record-1',
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

  const service = new RcMobileNumberCheckService({
    record: recordRepository,
    audit: { create: async ({ data }: { data: Record<string, unknown> }) => { auditEvents.push(data); } },
    provider: {
      checkRcMobileNumber: async (request: Record<string, unknown>) => {
        payload = request;
        return {
          success: true,
          status_code: 200,
          message_code: 'success',
          data: {
            client_id: 'rc-mobile-check-client-1',
            rc_number: 'UP10AB1234',
            mobile_number: '9999000123',
            is_mobile_number_match: true,
          },
        };
      },
    } as any,
    dataSecret,
  });

  const result = await service.checkRcMobileNumber({ rc_number: ' up 10 ab 1234 ', mobile_number: '+91 99990 00123' }, 'user-1');
  assert.deepEqual(payload, { rc_number: 'UP10AB1234', mobile_number: '9999000123' });
  assert.equal(result.record.status, 'SUCCESS');
  assert.equal(result.record.maskedRcNumber, 'UP10********1234');
  assert.equal(result.record.maskedMobileNumber, '******0123');
  assert.equal(result.record.isMobileNumberMatch, true);
  assert.equal((result.result as Record<string, unknown>).isMobileNumberMatch, true);
  assert.equal(records[0].encryptedResult.includes('9999000123'), false);
  assert.deepEqual(auditEvents.map((event) => event.action), [
    'RC_MOBILE_NUMBER_CHECK_REQUESTED',
    'RC_MOBILE_NUMBER_CHECK_SUCCEEDED',
  ]);
});

test('reuses the same successful check inside the 24-hour cache window', async () => {
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
      const record = { id: 'rc-mobile-check-cache-1', ...data, provider: 'SUREPASS', providerClientId: null, messageCode: null, safeMessage: null, encryptedResult: null, createdAt: new Date(), completedAt: null };
      records.push(record);
      return record;
    },
    update: async ({ data }: { where: { id: string }; data: Record<string, unknown> }) => {
      Object.assign(records[0], data);
      return records[0];
    },
  };
  const service = new RcMobileNumberCheckService({
    record: recordRepository,
    provider: {
      checkRcMobileNumber: async () => {
        providerCalls += 1;
        return { success: true, status_code: 200, data: { client_id: 'cache-client', rc_number: 'UP10AB1234', mobile_number: '9999000123', is_mobile_number_match: false } };
      },
    } as any,
    dataSecret,
  });

  const first = await service.checkRcMobileNumber({ rc_number: 'UP10AB1234', mobile_number: '9999000123' }, 'user-1');
  const second = await service.checkRcMobileNumber({ rc_number: 'up 10 ab 1234', mobile_number: '+91 9999000123' }, 'user-1');
  assert.equal(first.cacheHit, false);
  assert.equal(second.cacheHit, true);
  assert.equal(second.record.id, first.record.id);
  assert.equal(providerCalls, 1);
  assert.equal(records.length, 1);
});
