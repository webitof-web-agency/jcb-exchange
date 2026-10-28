import assert from 'node:assert/strict';
import test from 'node:test';

import {
  AadhaarVerificationService,
  aadhaarMatchesMasked,
  maskAadhaar,
  normalizeAadhaarDownloadResult,
  validateAadhaarNumber,
} from './aadhaarVerification.service';

test('validates an Aadhaar number with length and Verhoeff checksum', () => {
  assert.equal(validateAadhaarNumber('3114 8765 1231'), null);
  assert.equal(validateAadhaarNumber('9431 6894 5659'), null);
  assert.equal(validateAadhaarNumber('3114 8765 1233'), 'Enter a valid 12-digit Aadhaar number.');
  assert.equal(validateAadhaarNumber('1234'), 'Enter a valid 12-digit Aadhaar number.');
});

test('masks Aadhaar numbers without exposing the first eight digits', () => {
  assert.equal(maskAadhaar('311487651231'), 'XXXXXXXX1231');
});

test('matches the entered Aadhaar with the returned masked Aadhaar', () => {
  assert.equal(aadhaarMatchesMasked('311487651231', 'XXXXXXXX1231'), true);
  assert.equal(aadhaarMatchesMasked('311487651231', 'XXXXXXXX1234'), false);
  assert.equal(aadhaarMatchesMasked('XXXXXXXX1231', '1231'), true);
});
test('normalizes the Surepass DigiLocker response from the documented nested shape', () => {
  const result = normalizeAadhaarDownloadResult({
    client_id: 'digilocker_12345ABCDE',
    digilocker_metadata: {
      name: 'RAHUL KUMAR',
      gender: 'M',
      dob: '1995-05-15',
      mobile_number: '9876543210',
    },
    aadhaar_xml_data: {
      full_name: 'Rahul Kumar',
      care_of: 'S/O: Mohan Kumar',
      dob: '1995-05-15',
      yob: '1995',
      zip: '110001',
      profile_image: 'base64_encoded_image_string',
      gender: 'M',
      masked_aadhaar: 'XXXXXXXX1234',
      full_address: 'Connaught Place, New Delhi, Delhi, India',
      father_name: null,
      address: {
        country: 'India',
        dist: 'New Delhi',
        state: 'Delhi',
        po: 'Connaught Place',
        house: '12B',
        loc: 'Central Delhi',
        vtc: 'Connaught Place',
        subdist: 'New Delhi',
        street: 'Main Road',
        landmark: 'Near Metro Station',
      },
    },
    xml_url: 'https://provider.example/rahul/aadhaar.xml?signature=secret',
  });

  assert.deepEqual(result, {
    clientId: 'digilocker_12345ABCDE',
    fullName: 'Rahul Kumar',
    fatherName: 'S/O: Mohan Kumar',
    careOf: 'S/O: Mohan Kumar',
    dob: '1995-05-15',
    yob: '1995',
    gender: 'M',
    mobileNumber: '9876543210',
    maskedAadhaar: 'XXXXXXXX1234',
    issueDate: null,
    fullAddress: 'Connaught Place, New Delhi, Delhi, India',
    address: {
      country: 'India',
      district: 'New Delhi',
      state: 'Delhi',
      postOffice: 'Connaught Place',
      house: '12B',
      locality: 'Central Delhi',
      vtc: 'Connaught Place',
      subDistrict: 'New Delhi',
      street: 'Main Road',
      landmark: 'Near Metro Station',
      pincode: '110001',
    },
    profileImage: 'data:image/jpeg;base64,base64_encoded_image_string',
    xmlUrl: 'https://provider.example/rahul/aadhaar.xml?signature=secret',
  });
});

test('returns the wallet charge details when Aadhaar direct mode starts', async () => {
  let record: any = {
    id: 'aadhaar-record-1',
    side: 'SALE',
    status: 'PENDING',
    maskedAadhaar: 'XXXXXXXX1231',
    provider: 'SUREPASS',
    providerClientId: null,
    messageCode: null,
    safeMessage: null,
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    completedAt: null,
  };

  const service = new AadhaarVerificationService({
    record: {
      findFirst: async () => null,
      findUnique: async () => record,
      create: async () => record,
      update: async ({ data }: { data: Record<string, unknown> }) => {
        record = { ...record, ...data };
        return record;
      },
    },
    provider: {
      initializeDigilocker: async () => ({
        success: true,
        status_code: 200,
        data: { client_id: 'digilocker-client', token: 'sdk-token', expiry_seconds: 600 },
      }),
    } as any,
    dataSecret: 'test-secret',
    billing: {
      chargeForProviderCall: async () => ({
        charged: true,
        billingMode: 'ACTIVE' as const,
        amountPaise: 100,
        amountRupees: '1.00',
        balanceRupees: '49.00',
        serviceKey: 'AADHAAR_DIGILOCKER' as const,
        usageId: 'usage-1',
      }),
    },
  });

  const result = await service.initialize({ aadhaarNumber: '311487651231', side: 'SALE' }, 'user-1');

  assert.deepEqual(result.billing, {
    charged: true,
    billingMode: 'ACTIVE',
    amountRupees: '1.00',
    balanceRupees: '49.00',
    serviceKey: 'AADHAAR_DIGILOCKER',
  });
});

test('allows direct DigiLocker initialization without upfront Aadhaar number', async () => {
  let record: Record<string, unknown> = {
    id: 'aadhaar-record-2',
    side: 'SALE',
    status: 'PENDING',
    maskedAadhaar: 'PENDING',
    provider: 'SUREPASS',
    providerClientId: null,
    messageCode: null,
    safeMessage: null,
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    completedAt: null,
  };

  const service = new AadhaarVerificationService({
    record: {
      findFirst: async () => null,
      findUnique: async () => record,
      create: async () => record,
      update: async ({ data }: { data: Record<string, unknown> }) => {
        record = { ...record, ...data };
        return record;
      },
    },
    provider: {
      initializeDigilocker: async () => ({
        success: true,
        status_code: 200,
        data: { client_id: 'digilocker-client-2', token: 'sdk-token-2', expiry_seconds: 600 },
      }),
    } as any,
    dataSecret: 'test-secret',
  });

  const initResult = await service.initialize({ side: 'SALE' }, 'user-1');
  assert.equal(initResult.sdkToken, 'sdk-token-2');
  assert.equal(initResult.record.id, 'aadhaar-record-2');
});

test('checkStatus returns pending without failing when user has not completed OTP in popup', async () => {
  let record: Record<string, unknown> = {
    id: 'aadhaar-record-status-1',
    requestedById: 'user-1',
    side: 'SALE',
    status: 'PENDING',
    providerClientId: 'digilocker-client-status',
    maskedAadhaar: 'PENDING',
  };

  const service = new AadhaarVerificationService({
    record: {
      findUnique: async () => record,
      update: async ({ data }: { data: Record<string, unknown> }) => {
        record = { ...record, ...data };
        return record;
      },
    } as any,
    provider: {
      downloadAadhaar: async () => {
        throw new Error('Not completed yet');
      },
    } as any,
    dataSecret: 'test-secret',
  });

  const status = await service.checkStatus('aadhaar-record-status-1', 'user-1');
  assert.equal(status.ready, false);
  assert.equal(status.status, 'PENDING');
  // Record MUST NOT be marked failed!
  assert.equal(record.status, 'PENDING');
});
