import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  PanVerificationService,
  sanitizeAadhaarResult,
  sanitizeContactResult,
  sanitizePanComprehensiveV2Result,
  sanitizePanVerifyResult,
} from './panVerification.service';

test('PAN verify result is reduced to safe, masked fields', () => {
  const result = sanitizePanVerifyResult('ABCDE1234F', {
    client_id: 'provider-client-id',
    pan_number: 'ABCDE1234F',
    full_name: ' Munna   Tripathi ',
    dob: '2000-01-01',
    status: 'VALID',
    secret_field: 'must not be persisted',
  });

  assert.deepEqual(result, {
    pan: 'ABCDE****F',
    fullName: 'Munna Tripathi',
    dob: '2000-01-01',
    status: 'VALID',
    providerClientId: 'provider-client-id',
  });
});

test('Aadhaar result never exposes an unmasked Aadhaar number', () => {
  assert.deepEqual(
    sanitizeAadhaarResult('ABCDE1234F', { aadhaar_number: '123456789012' }),
    { pan: 'ABCDE****F', aadhaarNumber: 'XXXXXXXX9012' },
  );
  assert.equal(
    sanitizeAadhaarResult('ABCDE1234F', { aadhaar_number: '**** **** 9012' }).aadhaarNumber,
    'XXXXXXXX9012',
  );
});

test('PAN Comprehensive V2 keeps the full allowlisted profile safe and masked', () => {
  assert.deepEqual(
    sanitizePanComprehensiveV2Result('AGYPP1234F', {
      client_id: 'pan_comprehensive_v2_client',
      pan_number: 'ACNPR3826N',
      pan_details: {
        full_name: ' MUNNA   BHAIYA ',
        full_name_split: ['MUNNA', 'BHAIYA'],
        masked_aadhaar: 'XXXXXXXX1234',
        address: {
          line_1: 'A-123',
          line_2: '',
          street_name: 'Mirzapur',
          zip: '302017',
          city: 'Mirzapur',
          state: '',
          country: 'INDIA',
          full: 'A-102/3S.F.S. Mirzapur 302017 Uttarpradesh INDIA',
          secret: 'must not persist',
        },
        email: 'ab********st@gmail.com',
        phone_number: '98XXXXXX24',
        gender: 'M',
        dob: '1961-06-12',
        input_dob: null,
        aadhaar_linked: true,
        dob_verified: false,
        dob_check: false,
        category: 'person',
        less_info: false,
      },
      is_sole_proprietor: true,
      is_director: true,
      is_salaried: true,
      secret_field: 'must not persist',
    }),
    {
      pan: 'ACNPR****N',
      panNumber: 'ACNPR****N',
      providerClientId: 'pan_comprehensive_v2_client',
      panDetails: {
        fullName: 'MUNNA BHAIYA',
        fullNameSplit: ['MUNNA', 'BHAIYA'],
        maskedAadhaar: 'XXXXXXXX1234',
        address: {
          line1: 'A-123',
          line2: null,
          streetName: 'Mirzapur',
          zip: '302017',
          city: 'Mirzapur',
          state: null,
          country: 'INDIA',
          full: 'A-102/3S.F.S. Mirzapur 302017 Uttarpradesh INDIA',
        },
        email: 'ab********st@gmail.com',
        phoneNumber: '98XXXXXX24',
        gender: 'M',
        dob: '1961-06-12',
        inputDob: null,
        aadhaarLinked: true,
        dobVerified: false,
        dobCheck: false,
        category: 'person',
        lessInfo: false,
        status: null,
      },
      isSoleProprietor: true,
      isDirector: true,
      isSalaried: true,
      providerData: {
        client_id: 'pan_comprehensive_v2_client',
        pan_number: 'ACNPR****N',
        pan_details: {
          full_name: 'MUNNA   BHAIYA',
          full_name_split: ['MUNNA', 'BHAIYA'],
          masked_aadhaar: 'XXXXXXXX1234',
          address: {
            line_1: 'A-123',
            line_2: '',
            street_name: 'Mirzapur',
            zip: '302017',
            city: 'Mirzapur',
            state: '',
            country: 'INDIA',
            full: 'A-102/3S.F.S. Mirzapur 302017 Uttarpradesh INDIA',
          },
          email: 'ab********st@gmail.com',
          phone_number: '98XXXXXX24',
          gender: 'M',
          dob: '1961-06-12',
          input_dob: null,
          aadhaar_linked: true,
          dob_verified: false,
          dob_check: false,
          category: 'person',
          less_info: false,
        },
        is_sole_proprietor: true,
        is_director: true,
        is_salaried: true,
      },
    },
  );
});

test('PAN Comprehensive V2 maps the direct sandbox response shape and retains complete safe provider data', () => {
  const result = sanitizePanComprehensiveV2Result('ASXPH5090E', {
    client_id: 'pan_comprehensive_client',
    pan_number: 'ASXPH5090E',
    full_name: 'HITESH',
    full_name_split: ['', '', 'HITESH'],
    masked_aadhaar: 'XXXXXXXX5043',
    address: { full: '', city: '' },
    email: null,
    phone_number: null,
    gender: 'M',
    dob: '1998-08-20',
    aadhaar_linked: true,
    status: 'valid',
    less_info: false,
    unexpected_provider_field: 'preserve safely',
  });

  assert.equal((result.panDetails as Record<string, unknown>).fullName, 'HITESH');
  assert.equal((result.panDetails as Record<string, unknown>).dob, '1998-08-20');
  assert.equal((result.panDetails as Record<string, unknown>).aadhaarLinked, true);
  assert.equal((result.providerData as Record<string, unknown>).pan_number, 'ASXPH****E');
  assert.equal((result.providerData as Record<string, unknown>).email, null);
  assert.equal((result.providerData as Record<string, unknown>).unexpected_provider_field, 'preserve safely');
});

test('PAN Advanced V2 maps the supplied government-style response fields safely', () => {
  const result = sanitizePanComprehensiveV2Result('EKRPR1234F', {
    client_id: 'pan_advanced_client',
    pan_number: 'EKRPR1234F',
    full_name: 'VISHAL RATHORE',
    title: 'Shri',
    pan_status: 'E',
    pan_status_desc: 'EXISTING AND VALID',
    aadhaar_seeding_status: 'Y',
    aadhaar_seeding_status_desc: 'Aadhaar Seeding is Successful',
    pan_modified_date: null,
    category: 'person',
    secret_field: 'must not persist',
  });

  const details = result.panDetails as Record<string, unknown>;
  assert.equal(result.pan, 'EKRPR****F');
  assert.equal(details.fullName, 'VISHAL RATHORE');
  assert.equal(details.title, 'Shri');
  assert.equal(details.status, 'EXISTING AND VALID');
  assert.equal(details.panStatus, 'E');
  assert.equal(details.aadhaarSeedingStatus, 'Y');
  assert.equal(details.aadhaarLinked, true);
  assert.equal(details.category, 'person');
  assert.equal((result.providerData as Record<string, unknown>).secret_field, undefined);
});

test('contact result keeps only email and mobile arrays', () => {
  assert.deepEqual(
    sanitizeContactResult('ABCDE1234F', {
      email_id: ['user@example.com', ''],
      mobile_number: ['9876543210'],
      pan_number: 'ABCDE1234F',
      raw: 'must not persist',
    }),
    {
      pan: 'ABCDE****F',
      emails: ['user@example.com'],
      mobileNumbers: ['9876543210'],
    },
  );
});

test('each operation makes one independent provider call and persists an encrypted safe result', async () => {
  const records: any[] = [];
  const calls: Array<{ operation: string; payload: Record<string, unknown> }> = [];
  const recordRepository = {
    findFirst: async ({ where }: { where: Record<string, any> }) => records.find((record) =>
      Object.entries(where).every(([key, value]) => {
        if (key === 'status') return record.status === value;
        if (key === 'operation') return record.operation === value;
        if (key === 'requestFingerprint') return record.requestFingerprint === value;
        if (key === 'encryptedResult') return typeof record.encryptedResult === 'string';
        return true;
      }),
    ) || null,
    findUnique: async () => null,
    findMany: async () => records,
    count: async () => records.length,
    create: async ({ data }: { data: Record<string, unknown> }) => {
      const record = { id: `record-${records.length + 1}`, ...data, provider: 'SUREPASS', providerClientId: null, messageCode: null, safeMessage: null, encryptedResult: null, createdAt: new Date(), completedAt: null };
      records.push(record);
      return record;
    },
    update: async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => {
      const record = records.find((item) => item.id === where.id);
      Object.assign(record, data);
      return record;
    },
  };
  const provider = {
    verifyPan: async (payload: Record<string, unknown>) => {
      calls.push({ operation: 'verify', payload });
      return { success: true, status_code: 200, message_code: 'verified', data: { client_id: 'client-1', full_name: 'Test User', dob: '2000-01-01', status: 'VALID' } };
    },
    getPanLinkedAadhaar: async (payload: Record<string, unknown>) => {
      calls.push({ operation: 'aadhaar', payload });
      return { success: true, status_code: 200, data: { aadhaar_number: '123456789012' } };
    },
    getPanLinkedContacts: async (payload: Record<string, unknown>) => {
      calls.push({ operation: 'contact', payload });
      return { success: true, status_code: 200, data: { email_id: ['test@example.com'], mobile_number: ['9876543210'] } };
    },
    getPanComprehensiveV2: async (payload: Record<string, unknown>) => {
      calls.push({ operation: 'comprehensive-v2', payload });
      return {
        success: true,
        status_code: 200,
        data: {
          client_id: 'comprehensive-client',
          pan_number: 'ABCDE1234F',
          pan_details: { full_name: 'Test User', category: 'person' },
          is_director: false,
        },
      };
    },
  };
  const service = new PanVerificationService({
    record: recordRepository,
    provider: provider as any,
    dataSecret: '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',
  });

  await service.verifyPan({ id_number: 'ABCDE1234F', full_name: 'Test User', dob: '2000-01-01' }, 'user-1');
  const cached = await service.verifyPan({ id_number: ' abcde1234f ', full_name: 'Test User', dob: '2000-01-01' }, 'user-1');
  await service.getPanToAadhaar({ pan_number: 'ABCDE1234F' }, 'user-1');
  await service.getPanToContacts({ id_number: 'ABCDE1234F', fetch_email: false }, 'user-1');
  await service.getPanComprehensiveV2({ id_number: 'ABCDE1234F' }, 'user-1');

  assert.deepEqual(calls.map((call) => call.operation), ['verify', 'aadhaar', 'contact', 'comprehensive-v2']);
  assert.equal((cached as { cacheHit?: boolean }).cacheHit, true);
  assert.deepEqual(calls[0]?.payload, { id_number: 'ABCDE1234F', full_name: 'Test User', dob: '2000-01-01' });
  assert.deepEqual(calls[1]?.payload, { pan_number: 'ABCDE1234F' });
  assert.deepEqual(calls[2]?.payload, { id_number: 'ABCDE1234F' });
  assert.deepEqual(calls[3]?.payload, { id_number: 'ABCDE1234F' });
  assert.equal(records.every((record) => typeof record.encryptedResult === 'string' && !record.encryptedResult.includes('test@example.com')), true);
});

test('invalid request is rejected before any provider call', async () => {
  let calls = 0;
  const service = new PanVerificationService({
    record: {
      findFirst: async () => null,
      findUnique: async () => null,
      findMany: async () => [],
      count: async () => 0,
      create: async () => { throw new Error('must not create a record'); },
      update: async () => { throw new Error('must not update a record'); },
    },
    provider: { verifyPan: async () => { calls += 1; return {}; } } as any,
    dataSecret: '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',
  });

  await assert.rejects(() => service.verifyPan({ id_number: 'INVALID', full_name: 'Test', dob: '2000-01-01' }, 'user-1'), { statusCode: 400 });
  assert.equal(calls, 0);
});

test('charges the PAN wallet only when a fresh provider request is made', async () => {
  const records: any[] = [];
  const charges: any[] = [];
  const recordRepository = {
    findFirst: async ({ where }: { where: Record<string, any> }) => records.find((record) =>
      Object.entries(where).every(([key, value]) => {
        if (key === 'status' || key === 'operation' || key === 'requestFingerprint') return record[key] === value;
        if (key === 'encryptedResult') return typeof record.encryptedResult === 'string';
        return true;
      }),
    ) || null,
    findUnique: async () => null,
    findMany: async () => records,
    count: async () => records.length,
    create: async ({ data }: { data: Record<string, unknown> }) => {
      const record = { id: `record-${records.length + 1}`, ...data, provider: 'SUREPASS', providerClientId: null, messageCode: null, safeMessage: null, encryptedResult: null, createdAt: new Date(), completedAt: null };
      records.push(record);
      return record;
    },
    update: async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => {
      const record = records.find((item) => item.id === where.id);
      Object.assign(record, data);
      return record;
    },
  };
  const service = new PanVerificationService({
    record: recordRepository,
    provider: {
      verifyPan: async () => ({ success: true, status_code: 200, data: { full_name: 'Test User', dob: '2000-01-01', status: 'VALID' } }),
    } as any,
    dataSecret: '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',
    billing: {
      chargeForProviderCall: async (input: unknown) => {
        charges.push(input);
        return { charged: true, billingMode: 'ACTIVE', amountPaise: 20, amountRupees: '0.20', balanceRupees: '99.80', serviceKey: 'PAN_VERIFICATION' };
      },
    },
  });

  await service.verifyPan({ id_number: 'ABCDE1234F', full_name: 'Test User', dob: '2000-01-01' }, 'user-1');
  await service.verifyPan({ id_number: 'ABCDE1234F', full_name: 'Test User', dob: '2000-01-01' }, 'user-1');

  assert.deepEqual(charges, [{ serviceKey: 'PAN_VERIFICATION', verificationRecordId: 'record-1', requestedById: 'user-1' }]);
});
