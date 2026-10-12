import assert from 'node:assert/strict';
import test from 'node:test';
import {
  ChassisToRcVerificationService,
  maskChassisNumber,
} from './chassisToRcVerification.service';

const dataSecret = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';

test('masks chassis data before it is exposed in history', () => {
  assert.equal(maskChassisNumber('MALBM51ABC123456'), 'MALB********3456');
});

test('calls the chassis-to-RC endpoint and persists an encrypted normalized result', async () => {
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
        id: 'chassis-record-1',
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

  const service = new ChassisToRcVerificationService({
    record: recordRepository,
    audit: { create: async ({ data }: { data: Record<string, unknown> }) => { auditEvents.push(data); } },
    provider: {
      verifyChassisToRc: async (request: Record<string, unknown>) => {
        payload = request;
        return {
          success: true,
          status_code: 200,
          message_code: 'success',
          data: {
            client_id: 'chassis-client-1',
            rc_number: 'PB00AZ1234',
            vehicle_chasi_number: 'MALBM51ABC123456',
            details: {
              rc_number: 'PB00AZ1234',
              owner_name: 'TARSEM SINGH',
              vehicle_category: 'LMV',
              registration_date: '2019-01-26',
              rc_status: 'ACTIVE',
              vehicle_engine_number: 'PRIVATE-ENGINE',
            },
          },
        };
      },
    } as any,
    dataSecret,
  });

  const result = await service.verifyChassisToRc({ chassis_number: ' mal bm 51 abc 123456 ' }, 'user-1');
  assert.deepEqual(payload, { chassis_number: 'MALBM51ABC123456' });
  assert.equal(result.record.status, 'SUCCESS');
  assert.equal(result.record.maskedChassisNumber, 'MALB********3456');
  assert.equal(result.record.rcNumber, 'PB00AZ1234');
  assert.equal((result.result as Record<string, unknown>).ownerName, 'TARSEM SINGH');
  assert.equal(records[0].encryptedResult.includes('PRIVATE-ENGINE'), false);
  assert.deepEqual(auditEvents.map((event) => event.action), [
    'CHASSIS_TO_RC_REQUESTED',
    'CHASSIS_TO_RC_SUCCEEDED',
  ]);
});

test('reuses the same successful record inside the 24-hour cache window', async () => {
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
        id: 'chassis-cache-1',
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
  const service = new ChassisToRcVerificationService({
    record: recordRepository,
    provider: {
      verifyChassisToRc: async () => {
        providerCalls += 1;
        return {
          success: true,
          status_code: 200,
          data: {
            client_id: 'cache-client',
            rc_number: 'PB00AZ1234',
            details: { owner_name: 'CACHE USER', rc_status: 'ACTIVE' },
          },
        };
      },
    } as any,
    dataSecret,
  });

  const first = await service.verifyChassisToRc({ chassis_number: 'MALBM51ABC123456' }, 'user-1');
  const second = await service.verifyChassisToRc({ chassis_number: ' mal bm 51 abc 123456 ' }, 'user-1');
  assert.equal(first.cacheHit, false);
  assert.equal(second.cacheHit, true);
  assert.equal(second.record.id, first.record.id);
  assert.equal(providerCalls, 1);
  assert.equal(records.length, 1);
});
