import assert from 'node:assert/strict';
import test from 'node:test';
import {
  RcOwnerHistoryService,
  maskRcNumber,
  normalizeRcOwnerHistoryResult,
} from './rcOwnerHistory.service';

const dataSecret = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';

test('masks RC data and drops malformed provider dates', () => {
  assert.equal(maskRcNumber('RJ12XJ1234'), 'RJ12********1234');
  assert.deepEqual(normalizeRcOwnerHistoryResult({
    client_id: 'rc-client-1',
    rc_number: 'RJ12XJ1234',
    registration_date: '2017-09-05',
    owner_name: ' Munna Bhaiya ',
    father_name: 'Kaleen Bhaiya',
    fit_up_to: '2099-09-00',
    insurance_upto: '2099-00-04',
    latest_by: '1497-00-27',
    permit_valid_upto: '2080-11-06',
    less_info: true,
    financed: true,
    challan_details: { should: 'not be rendered as object text' },
  }), {
    providerClientId: 'rc-client-1',
    rcNumber: 'RJ12XJ1234',
    registrationDate: '2017-09-05',
    ownerName: 'Munna Bhaiya',
    fatherName: 'Kaleen Bhaiya',
    permitValidUpto: '2080-11-06',
    lessInfo: true,
    financed: true,
    challanDetails: { should: 'not be rendered as object text' },
  });
});

test('does not call Surepass for malformed RC input', async () => {
  let calls = 0;
  const service = new RcOwnerHistoryService({
    record: {
      findFirst: async () => null,
      findUnique: async () => null,
      findMany: async () => [],
      count: async () => 0,
      create: async () => { throw new Error('must not create a record'); },
      update: async () => { throw new Error('must not update a record'); },
    },
    provider: { verifyRcFull: async () => { calls += 1; return {}; } } as any,
    dataSecret,
  });

  await assert.rejects(
    () => service.verifyRc({ id_number: 'RJ12<script>' }, 'user-1'),
    { statusCode: 400 },
  );
  assert.equal(calls, 0);
});

test('persists an encrypted RC result and records an auditable success', async () => {
  const records: any[] = [];
  const auditEvents: Array<Record<string, unknown>> = [];
  let payload: Record<string, unknown> | null = null;
  const recordRepository = {
    findFirst: async () => null,
    findUnique: async () => null,
    findMany: async () => records,
    count: async () => records.length,
    create: async ({ data }: { data: Record<string, unknown> }) => {
      const record = { id: 'rc-record-1', ...data, provider: 'SUREPASS', providerClientId: null, messageCode: null, safeMessage: null, encryptedResult: null, createdAt: new Date(), completedAt: null };
      records.push(record);
      return record;
    },
    update: async ({ data }: { where: { id: string }; data: Record<string, unknown> }) => {
      Object.assign(records[0], data);
      return records[0];
    },
  };
  const service = new RcOwnerHistoryService({
    record: recordRepository,
    audit: { create: async ({ data }: { data: Record<string, unknown> }) => { auditEvents.push(data); } },
    provider: {
      verifyRcFull: async (request: Record<string, unknown>) => {
        payload = request;
        return {
          success: true,
          status_code: 200,
          message_code: 'success',
          data: {
            client_id: 'rc-client-1',
            rc_number: 'RJ12XJ1234',
            registration_date: '2017-09-05',
            owner_name: 'MUNNA BHAIYA',
            vehicle_chasi_number: 'PRIVATE-CHASSIS',
            vehicle_engine_number: 'PRIVATE-ENGINE',
            less_info: false,
          },
        };
      },
    } as any,
    dataSecret,
  });

  const result = await service.verifyRc({ id_number: ' rj12xj1234 ' }, 'user-1');
  assert.deepEqual(payload, { id_number: 'RJ12XJ1234' });
  assert.equal(result.record.status, 'SUCCESS');
  assert.equal(result.record.maskedRcNumber, 'RJ12********1234');
  assert.equal(records[0].encryptedResult.includes('PRIVATE-CHASSIS'), false);
  assert.equal((result.result as Record<string, unknown>).ownerName, 'MUNNA BHAIYA');
  assert.deepEqual(auditEvents.map((event) => event.action), [
    'RC_OWNER_HISTORY_REQUESTED',
    'RC_OWNER_HISTORY_SUCCEEDED',
  ]);
});
