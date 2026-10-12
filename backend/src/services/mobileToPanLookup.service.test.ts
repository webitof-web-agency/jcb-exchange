import assert from 'node:assert/strict';
import test from 'node:test';

import {
  maskMobileToPanName,
  MobileToPanLookupService,
} from './mobileToPanLookup.service';

const dataSecret = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';

test('masks the name before it is exposed in Mobile To PAN history', () => {
  assert.equal(maskMobileToPanName('Sambhaaji Singh'), 'S*******i S***h');
});

test('calls Mobile To PAN and stores only the encrypted masked result', async () => {
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
        id: 'mobile-to-pan-record-1',
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

  const service = new MobileToPanLookupService({
    record: recordRepository,
    audit: { create: async ({ data }: { data: Record<string, unknown> }) => { auditEvents.push(data); } },
    provider: {
      getPanByMobile: async (request: Record<string, unknown>) => {
        payload = request;
        return {
          success: true,
          status_code: 200,
          message_code: 'success',
          data: {
            client_id: 'mobile-to-pan-client-1',
            name: 'Sambhaaji Singh',
            mobile_no: '8888808969',
            pan_number: 'EKRPR1234F',
          },
        };
      },
    } as any,
    dataSecret,
  });

  const result = await service.lookupMobileToPan({ name: ' Sambhaaji Singh ', mobile_no: '+91 8888808969' }, 'user-1');
  assert.deepEqual(payload, { name: 'Sambhaaji Singh', mobile_no: '8888808969' });
  assert.equal(result.record.status, 'SUCCESS');
  assert.equal(result.record.maskedMobileNumber, '******8969');
  assert.equal(result.record.maskedName, 'S*******i S***h');
  assert.deepEqual(result.result, {
    name: 'Sambhaaji Singh',
    mobileNumber: '8888808969',
    panNumber: 'EKRPR****F',
    providerClientId: 'mobile-to-pan-client-1',
  });
  assert.equal(records[0].encryptedResult.includes('EKRPR1234F'), false);
  assert.deepEqual(auditEvents.map((event) => event.action), [
    'MOBILE_TO_PAN_LOOKUP_REQUESTED',
    'MOBILE_TO_PAN_LOOKUP_SUCCEEDED',
  ]);
});

test('reuses a successful Mobile To PAN result inside the 24-hour cache window', async () => {
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
        id: 'mobile-to-pan-cache-1',
        ...data,
        provider: 'SUREPASS',
        providerClientId: 'cache-client',
        messageCode: 'success',
        safeMessage: null,
        encryptedResult: null,
        createdAt: new Date(),
        completedAt: new Date(),
      };
      records.push(record);
      return record;
    },
    update: async ({ data }: { where: { id: string }; data: Record<string, unknown> }) => {
      Object.assign(records[0], data);
      return records[0];
    },
  };
  const service = new MobileToPanLookupService({
    record: recordRepository,
    provider: {
      getPanByMobile: async () => {
        providerCalls += 1;
        return { success: true, status_code: 200, data: { client_id: 'cache-client', name: 'Vishal', mobile_no: '8079012345', pan_number: 'EKRPR1234F' } };
      },
    } as any,
    dataSecret,
  });

  const first = await service.lookupMobileToPan({ name: 'Vishal', mobile_no: '8079012345' }, 'user-1');
  const second = await service.lookupMobileToPan({ name: ' Vishal ', mobile_no: '+91 8079012345' }, 'user-1');
  assert.equal(first.cacheHit, false);
  assert.equal(second.cacheHit, true);
  assert.equal(second.record.id, first.record.id);
  assert.equal(providerCalls, 1);
  assert.equal(records.length, 1);
});
