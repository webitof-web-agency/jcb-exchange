import assert from 'node:assert/strict';
import test from 'node:test';
import { SurepassProviderError } from './surepassClient';
import {
  RcFullService,
  RcOwnerHistoryService,
  maskRcNumber,
  normalizeRcOwnerHistoryResult,
  sanitizeRcFullResultForListing,
} from './rcOwnerHistory.service';
import { encryptPanData } from './panVerification.dataCrypto';

const dataSecret = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';

test('does not reuse an unsaved RC owner-history result from the verification cache', async () => {
  let providerCalls = 0;
  let createCalls = 0;
  const cached = {
    id: 'old-unsaved-record',
    serviceKey: 'RC_OWNER_HISTORY',
    status: 'SUCCESS',
    maskedRcNumber: 'RJ12********1234',
    requestedById: 'user-1',
    encryptedResult: encryptPanData(JSON.stringify({ rcNumber: 'RJ12XJ1234' }), dataSecret),
    rawDataExpiresAt: new Date(Date.now() + 60_000),
    completedAt: new Date(),
    createdAt: new Date(),
    template: null,
  };
  const service = new RcOwnerHistoryService({
    record: {
      findFirst: async ({ where }: { where: { status?: string } }) => where.status === 'PENDING' ? null : cached,
      findUnique: async () => null,
      findMany: async () => [],
      count: async () => 0,
      create: async ({ data }: { data: Record<string, unknown> }) => {
        createCalls += 1;
        return { id: 'new-record', ...data, createdAt: new Date(), completedAt: null, template: null };
      },
      update: async ({ data }: { data: Record<string, unknown> }) => ({ id: 'new-record', ...data, createdAt: new Date(), template: null }),
    } as any,
    provider: {
      verifyRcOwnerHistory: async () => {
        providerCalls += 1;
        return { success: true, status_code: 200, data: { rc_number: 'RJ12XJ1234' } };
      },
    } as any,
    dataSecret,
  });

  const result = await service.verifyRc({ id_number: 'RJ12XJ1234' }, 'user-1');

  assert.equal(providerCalls, 1);
  assert.equal(createCalls, 1);
  assert.equal(result.cacheHit, false);
});

test('RC owner-history details are unavailable unless a template was saved', async () => {
  const service = new RcOwnerHistoryService({
    record: {
      findFirst: async () => null,
      findUnique: async () => ({ id: 'unsaved-record', serviceKey: 'RC_OWNER_HISTORY', status: 'SUCCESS', encryptedResult: 'encrypted', template: null }),
      findMany: async () => [],
      count: async () => 0,
      create: async () => null,
      update: async () => null,
    },
    dataSecret,
  });

  await assert.rejects(
    () => service.getHistoryDetail('unsaved-record'),
    { statusCode: 404, code: 'record_not_found' },
  );
});

test('masks RC data and drops malformed provider dates', () => {
  assert.equal(maskRcNumber('RJ12XJ1234'), 'RJ12********1234');
  assert.deepEqual(normalizeRcOwnerHistoryResult({
    client_id: 'rc-client-1',
    rc_number: 'RJ12XJ1234',
    registration_date: '2017-09-05',
    registration_valid_upto: '2040-09-05',
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
    registrationUpto: '2040-09-05',
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
      verifyRcOwnerHistory: async (request: Record<string, unknown>) => {
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

test('uses the RC owner-history provider and preserves current owner history', async () => {
  const records: any[] = [];
  let providerCalls = 0;
  const recordRepository = {
    findFirst: async () => null,
    findUnique: async () => null,
    findMany: async () => records,
    count: async () => records.length,
    create: async ({ data }: { data: Record<string, unknown> }) => {
      const record = { id: 'rc-owner-history-record-1', ...data, provider: 'SUREPASS', providerClientId: null, messageCode: null, safeMessage: null, encryptedResult: null, createdAt: new Date(), completedAt: null };
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
    provider: {
      verifyRcOwnerHistory: async (request: Record<string, unknown>) => {
        providerCalls += 1;
        assert.deepEqual(request, { id_number: 'GJ01RV8999' });
        return {
          success: true,
          status_code: 200,
          message_code: 'success',
          data: {
            client_id: 'rc-owner-client-1',
            rc_number: 'GJ01RV8123',
            current_owner_name: 'MAHAMMADALI',
            current_owner_number: '3',
            owner_history: [
              { owner_name: 'HEMPREET SINGH BAJAJ', owner_number: '1' },
              { owner_name: 'VARUNKUMAR DINESHKUMAR GADHAVI', owner_number: '2' },
              { owner_name: 'MAHAMMADALI', owner_number: '3' },
            ],
          },
        };
      },
    } as any,
    dataSecret,
  });

  const result = await service.verifyRc({ id_number: 'GJ01RV8999' }, 'user-1');
  const normalized = result.result as Record<string, unknown>;

  assert.equal(providerCalls, 1);
  assert.equal(normalized.ownerName, 'MAHAMMADALI');
  assert.equal(normalized.ownerNumber, '3');
  assert.deepEqual(normalized.ownerHistory, [
    { ownerName: 'HEMPREET SINGH BAJAJ', ownerNumber: '1' },
    { ownerName: 'VARUNKUMAR DINESHKUMAR GADHAVI', ownerNumber: '2' },
    { ownerName: 'MAHAMMADALI', ownerNumber: '3' },
  ]);
});

test('keeps RC Full billing and audit records separate from RC Owner History', async () => {
  const records: any[] = [];
  const charges: any[] = [];
  const auditEvents: Array<Record<string, unknown>> = [];
  const recordRepository = {
    findFirst: async () => null,
    findUnique: async () => null,
    findMany: async () => records,
    count: async () => records.length,
    create: async ({ data }: { data: Record<string, unknown> }) => {
      const record = { id: 'rc-full-record-1', ...data, provider: 'SUREPASS', providerClientId: null, messageCode: null, safeMessage: null, encryptedResult: null, createdAt: new Date(), completedAt: null };
      records.push(record);
      return record;
    },
    update: async ({ data }: { where: { id: string }; data: Record<string, unknown> }) => {
      Object.assign(records[0], data);
      return records[0];
    },
  };
  const service = new RcFullService({
    record: recordRepository,
    audit: { create: async ({ data }: { data: Record<string, unknown> }) => { auditEvents.push(data); } },
    billing: {
      chargeForProviderCall: async (input) => {
        charges.push(input);
        return { charged: true, billingMode: 'ACTIVE', amountPaise: 500, amountRupees: '5.00', balanceRupees: '95.00', serviceKey: 'RC_FULL', usageId: 'usage-1' };
      },
    },
    provider: { verifyRcFull: async () => ({ success: true, status_code: 200, data: { rc_number: 'RJ12XJ1234' } }) } as any,
    dataSecret,
  });

  await service.verifyRc({ id_number: 'RJ12XJ1234' }, 'user-1');

  assert.equal(records[0].serviceKey, 'RC_FULL');
  assert.equal(charges[0].serviceKey, 'RC_FULL');
  assert.deepEqual(auditEvents.map((event) => event.action), ['RC_FULL_REQUESTED', 'RC_FULL_SUCCEEDED']);
});

test('reverses an RC Full wallet charge when the provider request fails', async () => {
  const records: any[] = [];
  const reversals: Array<Record<string, unknown>> = [];
  const recordRepository = {
    findFirst: async () => null,
    findUnique: async () => null,
    findMany: async () => records,
    count: async () => records.length,
    create: async ({ data }: { data: Record<string, unknown> }) => {
      const record = { id: 'rc-full-failed-1', ...data, provider: 'SUREPASS', providerClientId: null, messageCode: null, safeMessage: null, encryptedResult: null, createdAt: new Date(), completedAt: null };
      records.push(record);
      return record;
    },
    update: async ({ data }: { where: { id: string }; data: Record<string, unknown> }) => {
      Object.assign(records[0], data);
      return records[0];
    },
  };
  const service = new RcFullService({
    record: recordRepository,
    billing: {
      chargeForProviderCall: async () => ({ charged: true, billingMode: 'ACTIVE', amountPaise: 500, amountRupees: '5.00', balanceRupees: '95.00', serviceKey: 'RC_FULL', usageId: 'usage-failed-1' }),
      reverseProviderCharge: async (input) => {
        reversals.push(input);
        return { reversed: true, amountPaise: 500, amountRupees: '5.00', balanceRupees: '100.00', serviceKey: 'RC_FULL', usageId: 'usage-failed-1' };
      },
    },
    provider: { verifyRcFull: async () => { throw new Error('Surepass unavailable'); } } as any,
    dataSecret,
  });

  await assert.rejects(
    () => service.verifyRc({ id_number: 'RJ12XJ1234' }, 'user-1'),
    { statusCode: 502, code: 'verification_failed' },
  );
  assert.deepEqual(reversals, [{ usageId: 'usage-failed-1', reason: 'verification_failed' }]);
  assert.equal(records[0].status, 'FAILED');
});

test('sanitizes RC Full data before returning it to listing forms', () => {
  assert.deepEqual(sanitizeRcFullResultForListing({
    rcNumber: 'RJ12XJ1234',
    financer: 'INDUSIND BANK LTD.',
    registrationUpto: '2040-09-05',
    vehicleChasiNumber: 'CHASSIS123',
    vehicleEngineNumber: 'ENGINE123',
    makerDescription: 'JCB',
    makerModel: '3DX',
    ownerName: 'PRIVATE OWNER',
    presentAddress: 'PRIVATE ADDRESS',
    mobileNumber: '9999999999',
  }), {
    rcNumber: 'RJ12XJ1234',
    financer: 'INDUSIND BANK LTD.',
    registrationUpto: '2040-09-05',
    vehicleChasiNumber: 'CHASSIS123',
    vehicleEngineNumber: 'ENGINE123',
    makerDescription: 'JCB',
    makerModel: '3DX',
    ownerName: 'PRIVATE OWNER',
  });
});

test('rejects an RC Full provider response with a different registration number', async () => {
  const service = new RcFullService({
    record: {
      findFirst: async () => null,
      findUnique: async () => null,
      findMany: async () => [],
      count: async () => 0,
      create: async ({ data }: { data: Record<string, unknown> }) => ({ id: 'rc-mismatch', ...data }),
      update: async ({ data }: { data: Record<string, unknown> }) => data,
    },
    provider: { verifyRcFull: async () => ({ success: true, status_code: 200, data: { rc_number: 'DL02ZZ9999' } }) } as any,
    dataSecret,
  });

  await assert.rejects(
    () => service.verifyRc({ id_number: 'DL01AB1234' }, 'user-1'),
    { statusCode: 422, code: 'provider_identity_mismatch' },
  );
});

test('rejects a camelCase RC Full provider response with a different registration number', async () => {
  const service = new RcFullService({
    record: {
      findFirst: async () => null,
      findUnique: async () => null,
      findMany: async () => [],
      count: async () => 0,
      create: async ({ data }: { data: Record<string, unknown> }) => ({ id: 'rc-camel-mismatch', ...data }),
      update: async ({ data }: { data: Record<string, unknown> }) => data,
    },
    provider: { verifyRcFull: async () => ({ success: true, status_code: 200, data: { rcNumber: 'DL02ZZ9999' } }) } as any,
    dataSecret,
  });

  await assert.rejects(
    () => service.verifyRc({ id_number: 'DL01AB1234' }, 'user-1'),
    { statusCode: 422, code: 'provider_identity_mismatch' },
  );
});

test('gracefully falls back to verifyRcFull when verifyRcOwnerHistory encounters 500 provider unavailable', async () => {
  const records: any[] = [];
  let fullCalled = false;
  const service = new RcOwnerHistoryService({
    record: {
      findFirst: async () => null,
      findUnique: async () => null,
      findMany: async () => records,
      count: async () => records.length,
      create: async ({ data }: { data: Record<string, unknown> }) => {
        const record = { id: 'fallback-rec-1', ...data, provider: 'SUREPASS', providerClientId: null, messageCode: null, safeMessage: null, encryptedResult: null, createdAt: new Date(), completedAt: null, requestedBy: null, template: null };
        records.push(record);
        return record;
      },
      update: async ({ data }: { data: Record<string, unknown> }) => {
        Object.assign(records[0], data);
        return records[0];
      },
    } as any,
    provider: {
      verifyRcOwnerHistory: async () => {
        throw new SurepassProviderError('Internal Server Error', 500, 'internal_server_error', 'PROVIDER_UNAVAILABLE', true);
      },
      verifyRcFull: async () => {
        fullCalled = true;
        return {
          success: true,
          status_code: 200,
          message_code: 'success',
          data: {
            client_id: 'rc-fallback-client',
            rc_number: 'CG04HY3874',
            owner_name: 'DAULAT RAM DEWANGAN',
            registration_date: '2015-09-23',
          },
        };
      },
    } as any,
    dataSecret,
  });

  const result = await service.verifyRc({ id_number: 'CG04HY3874' }, 'user-1');
  assert.equal(fullCalled, true);
  assert.equal(result.record.status, 'SUCCESS');
  assert.equal((result.result as Record<string, unknown>).ownerName, 'DAULAT RAM DEWANGAN');
});
