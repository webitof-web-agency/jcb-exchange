import assert from 'node:assert/strict';
import test from 'node:test';

import {
  RcChallanVerificationService,
  normalizeRcChallanProviderResult,
} from './rcChallanVerification.service';
import { encryptPanData } from './panVerification.dataCrypto';
import { SurepassProviderError } from './surepassClient';

test('normalizes challans, calculates explicit-status totals, and creates collision-resistant keys', () => {
  const normalized = normalizeRcChallanProviderResult({
    client_id: 'rc_related_client_1',
    challan_details: {
      challans: [
        {
          number: 1,
          challan_number: 'DL112345678978',
          offense_details: 'Disobeying Lawful Directions',
          challan_place: null,
          challan_date: '2024-01-25',
          state: 'DL',
          rto: null,
          upstream_code: 'CENTRAL',
          accused_name: 'MUNNA BHAIYA',
          amount: 19500,
          challan_status: 'Pending',
          court_challan: true,
        },
        {
          number: 1,
          challan_number: 'TS998877665544',
          offense_details: 'Unknown status fine',
          amount: '2500',
          challan_status: null,
          court_challan: null,
        },
      ],
      blacklist: [{ reason: 'Reported stolen' }],
    },
  });

  assert.equal(normalized.providerClientId, 'rc_related_client_1');
  assert.equal(normalized.challans.length, 2);
  assert.notEqual(normalized.challans[0]?.recordKey, normalized.challans[1]?.recordKey);
  assert.deepEqual(normalized.summary, {
    totalChallans: 2,
    totalReturnedAmount: 22000,
    knownPendingCount: 1,
    knownPendingAmount: 19500,
    courtChallanCount: 1,
    blacklistCount: 1,
  });
  assert.equal(normalized.challans[1]?.challanStatus, null);
  assert.equal(normalized.challans[1]?.courtChallan, null);
});

test('normalizes the RC Challan Advanced array response without dropping provider fields', () => {
  const normalized = normalizeRcChallanProviderResult({
    rc_number: 'HR55AP0244',
    client_id: 'rc_challan_advanced_fZjEyLJOVdtgBWbWBgTA',
    challan_details: [{
      number: 1,
      challan_number: 'MH114168240703225216',
      offense_details: 'Reflectors not fitted',
      challan_place: '',
      offense_details_list: [{ offense_name: 'Reflectors not fitted' }],
      challan_date: '2024-07-03',
      challan_date_time: '2024-07-03T22:52:16',
      state: 'MH',
      rto: '',
      accused_name: 'M***J',
      amount: '1000',
      challan_status: 'Disposed',
      court_challan: false,
      court_name: '',
      upstream_code: 'CENTRAL_3',
    }],
  });

  assert.equal(normalized.providerClientId, 'rc_challan_advanced_fZjEyLJOVdtgBWbWBgTA');
  assert.equal(normalized.rcNumber, 'HR55AP0244');
  assert.equal(normalized.challans.length, 1);
  assert.equal(normalized.challans[0]?.challanDateTime, '2024-07-03T22:52:16');
  assert.equal(normalized.challans[0]?.courtName, null);
  assert.deepEqual(normalized.challans[0]?.offenseDetailsList, [{ offenseName: 'Reflectors not fitted', providerData: { offense_name: 'Reflectors not fitted' } }]);
  assert.equal(normalized.challans[0]?.providerData.challan_number, 'MH114168240703225216');
  assert.equal(
    (((normalized.providerData.challan_details as unknown[])?.[0] as Record<string, unknown>)?.offense_details_list as unknown[])?.[0] &&
      ((((normalized.providerData.challan_details as unknown[])?.[0] as Record<string, unknown>)?.offense_details_list as unknown[])?.[0] as Record<string, unknown>).offense_name,
    'Reflectors not fitted',
  );
});

test('treats an empty provider challan list as a completed lookup with no returned records', () => {
  const normalized = normalizeRcChallanProviderResult({
    challan_details: { challans: [], blacklist: [] },
  });

  assert.deepEqual(normalized.summary, {
    totalChallans: 0,
    totalReturnedAmount: 0,
    knownPendingCount: 0,
    knownPendingAmount: 0,
    courtChallanCount: 0,
    blacklistCount: 0,
  });
  assert.deepEqual(normalized.challans, []);
  assert.deepEqual(normalized.blacklist, []);
});

test('does not call Surepass when an identifier is missing', async () => {
  let calls = 0;
  const service = new RcChallanVerificationService({
    record: {
      findFirst: async () => null,
      findUnique: async () => null,
      findMany: async () => [],
      count: async () => 0,
      create: async () => { throw new Error('must not create a record'); },
      update: async () => { throw new Error('must not update a record'); },
    },
    provider: { verifyRcChallan: async () => { calls += 1; return {}; } } as any,
    dataSecret: '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',
  });

  await assert.rejects(
    () => service.verifyRcChallan({ rc_number: '' }, 'user-1'),
    { statusCode: 400 },
  );
  assert.equal(calls, 0);
});

test('reuses a fresh successful database result instead of calling Surepass again', async () => {
  let calls = 0;
  let creates = 0;
  const dataSecret = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
  const cachedResult = normalizeRcChallanProviderResult({
    client_id: 'cached-client',
    challan_details: { challans: [{ challan_number: 'DL-CACHED-1', amount: 500, challan_status: 'Pending' }], blacklist: [] },
  });
  const cachedRecord = {
    id: 'cached-record-1',
    status: 'SUCCESS',
    maskedRcNumber: 'HR55********0244',
    requestFingerprint: '',
    totalChallans: 1,
    knownPendingCount: 1,
    totalReturnedAmount: 500,
    knownPendingAmount: 500,
    courtChallanCount: 0,
    blacklistCount: 0,
    provider: 'SUREPASS',
    providerEnvironment: 'PRODUCTION',
    providerClientId: 'cached-client',
    messageCode: 'success',
    safeMessage: null,
    encryptedResult: encryptPanData(JSON.stringify(cachedResult), dataSecret),
    requestedById: 'user-1',
    createdAt: new Date(),
    completedAt: new Date(),
    requestedBy: { id: 'user-1', name: 'User', email: 'user@example.com' },
  };
  const service = new RcChallanVerificationService({
    record: {
      findFirst: async ({ where }: { where: Record<string, unknown> }) => where.status === 'SUCCESS' ? cachedRecord : null,
      findUnique: async () => cachedRecord,
      findMany: async () => [],
      count: async () => 0,
      create: async () => { creates += 1; throw new Error('must reuse cached record'); },
      update: async () => { throw new Error('must not update cached record'); },
    },
    provider: { verifyRcChallan: async () => { calls += 1; return {}; } } as any,
    dataSecret,
    baseUrl: 'https://kyc-api.surepass.io',
  });

  const result = await service.verifyRcChallan({ rc_number: 'HR55AP0244' }, 'user-1');

  assert.equal(calls, 0);
  assert.equal(creates, 0);
  assert.equal(result.record.id, 'cached-record-1');
  assert.equal((result.result as { challans: Array<{ challanNumber: string | null }> }).challans[0]?.challanNumber, 'DL-CACHED-1');
});

test('refreshes an expired result in the same database record', async () => {
  let calls = 0;
  const dataSecret = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
  const record = {
    id: 'expired-record-1',
    status: 'SUCCESS',
    maskedRcNumber: 'HR55********0244',
    requestFingerprint: '',
    totalChallans: 1,
    knownPendingCount: 1,
    totalReturnedAmount: 500,
    knownPendingAmount: 500,
    courtChallanCount: 0,
    blacklistCount: 0,
    provider: 'SUREPASS',
    providerEnvironment: 'PRODUCTION',
    providerClientId: 'old-client',
    messageCode: 'success',
    safeMessage: null,
    encryptedResult: encryptPanData(JSON.stringify(normalizeRcChallanProviderResult({ challan_details: { challans: [], blacklist: [] } })), dataSecret),
    requestedById: 'user-1',
    createdAt: new Date(Date.now() - 25 * 60 * 60 * 1000),
    completedAt: new Date(Date.now() - 25 * 60 * 60 * 1000),
    requestedBy: null,
  };
  const service = new RcChallanVerificationService({
    record: {
      findFirst: async ({ where }: { where: Record<string, any> }) => {
        if (where.status === 'PENDING') return null;
        if (where.requestFingerprint) return record;
        return null;
      },
      findUnique: async () => record,
      findMany: async () => [record],
      count: async () => 1,
      create: async () => { throw new Error('expired record should be refreshed in place'); },
      update: async ({ data }: { where: { id: string }; data: Record<string, unknown> }) => { Object.assign(record, data); return record; },
    },
    provider: {
      verifyRcChallan: async () => {
        calls += 1;
        return { success: true, status_code: 200, data: { client_id: 'new-client', challan_details: { challans: [], blacklist: [] } } };
      },
    } as any,
    dataSecret,
    baseUrl: 'https://kyc-api.surepass.io',
  });

  const result = await service.verifyRcChallan({ rc_number: 'HR55AP0244' }, 'user-1');

  assert.equal(calls, 1);
  assert.equal(result.record.id, 'expired-record-1');
  assert.equal(record.status, 'SUCCESS');
  assert.equal(record.providerClientId, 'new-client');
});

test('persists a minimal encrypted history record and sends normalized provider input', async () => {
  const records: any[] = [];
  const auditEvents: Array<Record<string, unknown>> = [];
  let payload: Record<string, unknown> | null = null;
  const dataSecret = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
  const recordRepository = {
    findFirst: async () => null,
    findUnique: async () => null,
    findMany: async () => records,
    count: async () => records.length,
    create: async ({ data }: { data: Record<string, unknown> }) => {
      const record = { id: 'challan-record-1', ...data, provider: 'SUREPASS', providerClientId: null, messageCode: null, safeMessage: null, encryptedResult: null, createdAt: new Date(), completedAt: null };
      records.push(record);
      return record;
    },
    update: async ({ data }: { where: { id: string }; data: Record<string, unknown> }) => {
      Object.assign(records[0], data);
      return records[0];
    },
  };
  const service = new RcChallanVerificationService({
    record: recordRepository,
    audit: { create: async ({ data }: { data: Record<string, unknown> }) => { auditEvents.push(data); } },
    provider: {
      verifyRcChallan: async (request: Record<string, unknown>) => {
        payload = request;
        return {
          success: true,
          status_code: 200,
          message_code: 'success',
          data: {
            client_id: 'challan-client-1',
            challan_details: {
              challans: [{ challan_number: 'DL112345678978', amount: 19500, challan_status: 'Pending', court_challan: true }],
              blacklist: [],
            },
          },
        };
      },
    } as any,
    dataSecret,
    baseUrl: 'https://kyc-api.surepass.io',
  });

  const result = await service.verifyRcChallan({ rc_number: ' hr55 ap0244 ' }, 'user-1');

  assert.deepEqual(payload, { rc_number: 'HR55AP0244' });
  assert.equal(result.record.status, 'SUCCESS');
  assert.equal(result.record.providerEnvironment, 'PRODUCTION');
  assert.equal(records[0].encryptedResult.includes('MA3JMTB1SPB851591'), false);
  assert.equal((result.result as { summary: { knownPendingAmount: number } }).summary.knownPendingAmount, 19500);
  assert.deepEqual(auditEvents.map((event) => event.action), [
    'RC_CHALLAN_VERIFICATION_REQUESTED',
    'RC_CHALLAN_VERIFICATION_SUCCEEDED',
  ]);
});

test('maps provider authentication failures to a safe configuration error', async () => {
  const records: any[] = [];
  const service = new RcChallanVerificationService({
    record: {
      findFirst: async () => null,
      findUnique: async () => null,
      findMany: async () => records,
      count: async () => records.length,
      create: async ({ data }: { data: Record<string, unknown> }) => {
        const record = { id: 'challan-record-2', ...data, createdAt: new Date(), completedAt: null };
        records.push(record);
        return record;
      },
      update: async ({ data }: { data: Record<string, unknown> }) => { Object.assign(records[0], data); return records[0]; },
    },
    provider: {
      verifyRcChallan: async () => { throw new SurepassProviderError('unauthorized', 401, 'invalid_token', 'AUTHENTICATION', false); },
    } as any,
    dataSecret: '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',
  });

  await assert.rejects(
    () => service.verifyRcChallan({ rc_number: 'HR55AP0244' }, 'user-1'),
    (error: unknown) => error instanceof Error && 'code' in error && (error as { code?: string }).code === 'provider_configuration_error',
  );
  assert.equal(records[0]?.status, 'FAILED');
});
