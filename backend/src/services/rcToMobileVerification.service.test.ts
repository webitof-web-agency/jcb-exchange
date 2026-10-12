import assert from 'node:assert/strict';
import test from 'node:test';
import {
  maskMobileNumber,
  RcToMobileVerificationService,
} from './rcToMobileVerification.service';

const dataSecret = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';

test('masks the mobile number before it is exposed in history', () => {
  assert.equal(maskMobileNumber('8890856565'), '******6565');
});

test('calls RC-to-mobile Surepass endpoint and encrypts the returned mobile number', async () => {
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
        id: 'rc-mobile-record-1',
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

  const service = new RcToMobileVerificationService({
    record: recordRepository,
    audit: { create: async ({ data }: { data: Record<string, unknown> }) => { auditEvents.push(data); } },
    provider: {
      verifyRcToMobile: async (request: Record<string, unknown>) => {
        payload = request;
        return {
          success: true,
          status_code: 200,
          message: 'Success',
          message_code: 'success',
          data: {
            client_id: 'rc-to-mobile-client-1',
            rc_number: 'RJ14XJ1234',
            mobile_number: '8890856565',
          },
        };
      },
    } as any,
    dataSecret,
  });

  const result = await service.verifyRcToMobile({ rc_number: ' rj 14 xj 1234 ' }, 'user-1');
  assert.deepEqual(payload, { rc_number: 'RJ14XJ1234' });
  assert.equal(result.record.status, 'SUCCESS');
  assert.equal(result.record.maskedRcNumber, 'RJ14********1234');
  assert.equal(result.record.maskedMobileNumber, '******6565');
  assert.equal((result.result as Record<string, unknown>).mobileNumber, '8890856565');
  assert.equal(records[0].encryptedResult.includes('8890856565'), false);
  assert.deepEqual(auditEvents.map((event) => event.action), [
    'RC_TO_MOBILE_REQUESTED',
    'RC_TO_MOBILE_SUCCEEDED',
  ]);
});

test('reuses the same successful RC-to-mobile record inside the 24-hour cache window', async () => {
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
      const record = { id: 'rc-mobile-cache-1', ...data, provider: 'SUREPASS', providerClientId: null, messageCode: null, safeMessage: null, encryptedResult: null, createdAt: new Date(), completedAt: null };
      records.push(record);
      return record;
    },
    update: async ({ data }: { where: { id: string }; data: Record<string, unknown> }) => {
      Object.assign(records[0], data);
      return records[0];
    },
  };
  const service = new RcToMobileVerificationService({
    record: recordRepository,
    provider: {
      verifyRcToMobile: async () => {
        providerCalls += 1;
        return { success: true, status_code: 200, data: { client_id: 'cache-client', rc_number: 'RJ14XJ1234', mobile_number: '8890856565' } };
      },
    } as any,
    dataSecret,
  });

  const first = await service.verifyRcToMobile({ rc_number: 'RJ14XJ1234' }, 'user-1');
  const second = await service.verifyRcToMobile({ rc_number: 'rj 14 xj 1234' }, 'user-1');
  assert.equal(first.cacheHit, false);
  assert.equal(second.cacheHit, true);
  assert.equal(second.record.id, first.record.id);
  assert.equal(providerCalls, 1);
  assert.equal(records.length, 1);
});
