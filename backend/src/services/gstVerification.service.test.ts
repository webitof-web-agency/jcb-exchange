import assert from 'node:assert/strict';
import test from 'node:test';
import {
  GstVerificationService,
  getGstRawDataExpiresAt,
  isGstRawDataAvailable,
  normalizeGstVerificationResult,
  maskGstin,
} from './gstVerification.service';
import { encryptPanData } from './panVerification.dataCrypto';

const dataSecret = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';

test('keeps GST raw data available only for the five-minute template window', () => {
  const completedAt = new Date('2026-10-27T10:00:00.000Z');
  const expiresAt = getGstRawDataExpiresAt(completedAt);
  assert.equal(expiresAt.toISOString(), '2026-10-27T10:05:00.000Z');
  assert.equal(isGstRawDataAvailable({ encryptedResult: 'cipher', rawDataExpiresAt: expiresAt }, expiresAt.getTime() - 1), true);
  assert.equal(isGstRawDataAvailable({ encryptedResult: 'cipher', rawDataExpiresAt: expiresAt }, expiresAt.getTime()), false);
});

test('stores a GST template privately and clears the encrypted result after upload', async () => {
  const records: any[] = [{
    id: 'gst-template-record',
    status: 'SUCCESS',
    maskedGstin: '08AK********1ZN',
    requestedById: 'user-1',
    provider: 'SUREPASS',
    encryptedResult: 'cipher',
    rawDataExpiresAt: new Date(Date.now() + 60_000),
    requestedBy: null,
    template: null,
    createdAt: new Date(),
    completedAt: new Date(),
  }];
  const templates: any[] = [];
  const service = new GstVerificationService({
    record: {
      findFirst: async () => null,
      findUnique: async () => records[0],
      findMany: async () => records,
      count: async () => records.length,
      create: async () => ({}),
      update: async ({ data }: { data: Record<string, unknown> }) => {
        Object.assign(records[0], data);
        return records[0];
      },
    },
    template: {
      findUnique: async () => null,
      create: async ({ data }: { data: Record<string, unknown> }) => {
        const template = { id: 'gst-template-1', ...data, createdAt: new Date() };
        templates.push(template);
        records[0].template = template;
        return template;
      },
      delete: async () => ({}),
    },
    uploadTemplateFile: async () => ({ fileId: 'drive-gst-template-1' }),
    deleteTemplateFile: async () => undefined,
    dataSecret,
  });

  const pdf = Buffer.from('%PDF-1.7\nmock-gst-template');
  const result = await service.uploadTemplate('gst-template-record', 'user-1', 'EMPLOYEE', pdf, 'application/pdf');
  assert.equal(templates.length, 1);
  assert.equal(result.template?.id, 'gst-template-1');
  assert.equal(records[0].encryptedResult, null);
  assert.equal(records[0].rawDataExpiresAt, null);
});

test('masks GSTIN and normalizes documented GST business fields', () => {
  assert.equal(maskGstin('08AKWPJ1234H1ZN'), '08AK********1ZN');
  assert.deepEqual(normalizeGstVerificationResult({
    gstin: '08AKWPJ1234H1ZN',
    client_id: 'corporate_gstin_client',
    business_name: ' MINDA MARWAR PRODUCER COMPANY ',
    legal_name: 'MADAN LAL JAT',
    gstin_status: 'Active',
    date_of_cancellation: '1800-01-01',
    contact_details: { principal: { address: 'Main road', email: 'gst@example.test' } },
    promoters: ['Director One', 7],
    annual_turnover: 'Slab: Rs. 1 Cr. to 5 Cr.',
    annual_turnover_fy: '2023-2024',
    percentage_in_cash: '10%',
    einvoice_status: true,
    liability_percentage_details: { liability: '5%' },
    nature_bus_activities: ['Retail Business', 4, ''],
    address_details: { address: 'Main road', ignored: 'not needed' },
    filing_status: [],
  }), {
    gstin: '08AKWPJ1234H1ZN',
    maskedGstin: '08AK********1ZN',
    providerData: {
      gstin: '08AKWPJ1234H1ZN',
      client_id: 'corporate_gstin_client',
      business_name: 'MINDA MARWAR PRODUCER COMPANY',
      legal_name: 'MADAN LAL JAT',
      gstin_status: 'Active',
      date_of_cancellation: '1800-01-01',
      contact_details: { principal: { address: 'Main road', email: 'gst@example.test' } },
      promoters: ['Director One', 7],
      annual_turnover: 'Slab: Rs. 1 Cr. to 5 Cr.',
      annual_turnover_fy: '2023-2024',
      percentage_in_cash: '10%',
      einvoice_status: true,
      liability_percentage_details: { liability: '5%' },
      nature_bus_activities: ['Retail Business', 4, ''],
      address_details: { address: 'Main road', ignored: 'not needed' },
      filing_status: [],
    },
    providerClientId: 'corporate_gstin_client',
    businessName: 'MINDA MARWAR PRODUCER COMPANY',
    legalName: 'MADAN LAL JAT',
    gstinStatus: 'Active',
    dateOfCancellation: '1800-01-01',
    contactDetails: { principal: { address: 'Main road', email: 'gst@example.test' } },
    promoters: ['Director One'],
    annualTurnover: 'Slab: Rs. 1 Cr. to 5 Cr.',
    annualTurnoverFy: '2023-2024',
    percentageInCash: '10%',
    einvoiceStatus: true,
    liabilityPercentageDetails: { liability: '5%' },
    natureOfBusinessActivities: ['Retail Business'],
    addressDetails: { address: 'Main road' },
    filingStatus: [],
  });
});

test('does not call the provider for malformed GSTIN input', async () => {
  let calls = 0;
  const service = new GstVerificationService({
    record: {
      findFirst: async () => null,
      findUnique: async () => null,
      findMany: async () => [],
      count: async () => 0,
      create: async () => { throw new Error('must not create a record'); },
      update: async () => { throw new Error('must not update a record'); },
    },
    provider: { verifyGstin: async () => { calls += 1; return {}; } } as any,
    dataSecret,
  });

  await assert.rejects(() => service.verifyGstin({ id_number: 'INVALID' }, 'user-1'), { statusCode: 400 });
  assert.equal(calls, 0);
});

test('persists an encrypted safe result for a successful GST lookup', async () => {
  const records: any[] = [];
  const auditEvents: Array<Record<string, unknown>> = [];
  let payload: Record<string, unknown> | null = null;
  const recordRepository = {
    findFirst: async ({ where }: { where: Record<string, any> }) => records.find((record) =>
      Object.entries(where).every(([key, value]) => {
        if (key === 'status') return record.status === value;
        if (key === 'requestFingerprint') return record.requestFingerprint === value;
        if (key === 'encryptedResult') return typeof record.encryptedResult === 'string';
        return true;
      }),
    ) || null,
    findUnique: async () => null,
    findMany: async () => records,
    count: async () => records.length,
    create: async ({ data }: { data: Record<string, unknown> }) => {
      const record = { id: 'gst-record-1', ...data, provider: 'SUREPASS', providerClientId: null, messageCode: null, safeMessage: null, encryptedResult: null, createdAt: new Date(), completedAt: null };
      records.push(record);
      return record;
    },
    update: async ({ data }: { where: { id: string }; data: Record<string, unknown> }) => {
      Object.assign(records[0], data);
      return records[0];
    },
  };
  const service = new GstVerificationService({
    record: recordRepository,
    audit: { create: async ({ data }: { data: Record<string, unknown> }) => { auditEvents.push(data); } },
    provider: {
      verifyGstin: async (request: Record<string, unknown>) => {
        payload = request;
        return {
          success: true,
          status_code: 200,
          message_code: 'success',
          data: {
            gstin: '08AKWPJ1234H1ZN',
            client_id: 'corporate_gstin_client',
            business_name: 'MINDA MARWAR PRODUCER COMPANY',
            gstin_status: 'Inactive',
          },
        };
      },
    } as any,
    dataSecret,
  });

  const result = await service.verifyGstin({ id_number: ' 08akwpj1234h1zn ' }, 'user-1');
  const cached = await service.verifyGstin({ id_number: '08AKWPJ1234H1ZN' }, 'user-1');
  assert.deepEqual(payload, {
    id_number: '08AKWPJ1234H1ZN',
  });
  assert.equal(result.record.status, 'SUCCESS');
  assert.equal(result.record.gstinStatus, 'Inactive');
  assert.equal((cached as { cacheHit?: boolean }).cacheHit, true);
  assert.equal(records[0].encryptedResult.includes('MINDA MARWAR PRODUCER COMPANY'), false);
  assert.equal((result.result as Record<string, unknown>).businessName, 'MINDA MARWAR PRODUCER COMPANY');
  assert.deepEqual(auditEvents.map((event) => event.action), ['GST_VERIFICATION_REQUESTED', 'GST_VERIFICATION_SUCCEEDED']);
});

test('loads a saved GST detail with the configured encryption secret', async () => {
  const result = normalizeGstVerificationResult({
    gstin: '08AKWPJ1234H1ZN',
    einvoice_status: false,
    fy: null,
    filing_status: [],
    hsn_info: {},
  });
  const service = new GstVerificationService({
    record: {
      findFirst: async () => null,
      findUnique: async () => ({
        id: 'gst-record-detail',
        status: 'SUCCESS',
        maskedGstin: '08AK********1ZN',
        provider: 'SUREPASS',
        providerClientId: null,
        gstinStatus: null,
        businessName: null,
        legalName: null,
        messageCode: 'success',
        safeMessage: null,
        encryptedResult: encryptPanData(JSON.stringify(result), dataSecret),
        rawDataExpiresAt: new Date(Date.now() + 60_000),
        requestedBy: null,
        createdAt: new Date(),
        completedAt: new Date(),
      }),
      findMany: async () => [],
      count: async () => 0,
      create: async () => ({}),
      update: async () => ({}),
    },
    dataSecret,
  });

  const detail = await service.getHistoryDetail('gst-record-detail');
  assert.deepEqual(detail.result, result);
  assert.deepEqual((detail.result as Record<string, unknown>).providerData, {
    gstin: '08AKWPJ1234H1ZN',
    einvoice_status: false,
    fy: null,
    filing_status: [],
    hsn_info: {},
  });
});
