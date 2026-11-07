import assert from 'node:assert/strict';
import test from 'node:test';
import { hashSignupClaim, hashSignupIdentity, PartnerSignupGstVerificationService } from './partnerSignupGstVerification.service';
import { decryptPanData, encryptPanData } from './panVerification.dataCrypto';
import { createVerificationFingerprint } from './verificationCache';

const dataSecret = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';

test('creates an expiring signup GST claim and stores provider data encrypted', async () => {
  const records: any[] = [];
  const service = new PartnerSignupGstVerificationService({
    dataSecret,
    provider: {
      verifyGstin: async () => ({
        data: {
          gstin: '22AAHCJ5752E1ZR',
          gstin_status: 'Active',
          business_name: 'Ravi Machines',
          legal_name: 'Ravi Machines Private Limited',
          pan_number: 'ABCDE1234F',
          contact_details: {
            principal: {
              mobile_number: '9876543210',
              email: 'gst@ravi-machines.in',
            },
          },
          address: 'Registered GST address',
        },
      }),
    } as any,
    record: {
      findFirst: async () => null,
      create: async ({ data }: any) => {
        const record = { id: 'claim-1', ...data };
        records.push(record);
        return record;
      },
      update: async ({ data }: any) => {
        Object.assign(records[0], data);
        return records[0];
      },
      updateMany: async () => ({ count: 1 }),
    },
  });

  const result = await service.verifySignupGstin({
    gstin: '22AAHCJ5752E1ZR',
    email: 'ravi@ravi-machines.in',
    mobile: '9876543210',
    countryId: 101,
    stateId: 22,
    cityId: 2201,
  });

  assert.match(result.claimToken, /^[a-f0-9]{64}$/);
  assert.equal(result.status, 'SUCCESS');
  assert.equal(result.businessName, 'Ravi Machines');
  assert.equal(result.gstinStatus, 'Active');
  assert.equal(records.length, 1);
  assert.equal(records[0].status, 'SUCCESS');
  assert.equal(records[0].gstin, '22AAHCJ5752E1ZR');
  assert.equal(records[0].countryId, 101);
  assert.equal(records[0].stateId, 22);
  assert.equal(records[0].cityId, 2201);
  assert.equal(typeof records[0].encryptedResult, 'string');
  assert.equal(records[0].encryptedResult.includes('Ravi Machines'), false);
  const retained = JSON.parse(decryptPanData(records[0].encryptedResult, dataSecret));
  assert.equal(retained.panNumber, 'ABCDE1234F');
  assert.deepEqual(retained.contactDetails, {
    principal: { mobile_number: '9876543210', email: 'gst@ravi-machines.in' },
  });
  assert.equal(retained.address, 'Registered GST address');
});

test('rejects an invalid GSTIN before calling the provider', async () => {
  let providerCalls = 0;
  const service = new PartnerSignupGstVerificationService({
    dataSecret,
    provider: { verifyGstin: async () => { providerCalls += 1; return { data: {} }; } } as any,
    record: { findFirst: async () => null, create: async () => ({}), update: async () => ({}), updateMany: async () => ({ count: 0 }) },
  });

  await assert.rejects(
    () => service.verifySignupGstin({ gstin: 'INVALID', email: 'ravi@ravi-machines.in' }),
    { statusCode: 400, code: 'invalid_gstin_request' },
  );
  assert.equal(providerCalls, 0);
});

test('rejects a consumer email before calling the GST provider', async () => {
  let providerCalls = 0;
  const service = new PartnerSignupGstVerificationService({
    dataSecret,
    provider: { verifyGstin: async () => { providerCalls += 1; return { data: {} }; } } as any,
    record: { findFirst: async () => null, create: async () => ({}), update: async () => ({}), updateMany: async () => ({ count: 0 }) },
  });

  await assert.rejects(
    () => service.verifySignupGstin({ gstin: '22AAHCJ5752E1ZR', email: 'ravi@gmail.com' }),
    { statusCode: 400, code: 'invalid_business_email' },
  );
  assert.equal(providerCalls, 0);
});

test('does not consume a verified claim when signup location changes', async () => {
  const claimToken = 'a'.repeat(64);
  let consumed = false;
  const service = new PartnerSignupGstVerificationService({
    dataSecret,
    claimSecret: 'claim-secret',
    record: {
      findFirst: async () => ({
        id: 'claim-1',
        status: 'SUCCESS',
        consumedAt: null,
        expiresAt: new Date(Date.now() + 60_000),
        signupEmailHash: hashSignupIdentity('ravi@ravi-machines.in', 'claim-secret'),
        signupMobileHash: null,
        countryId: 101,
        stateId: 22,
        cityId: 2201,
        encryptedResult: encryptPanData(JSON.stringify({ gstin: '22AAHCJ5752E1ZR' }), dataSecret),
      }),
      create: async () => ({}),
      update: async () => ({}),
      updateMany: async () => { consumed = true; return { count: 1 }; },
    },
  });

  await assert.rejects(
    () => service.consumeVerifiedClaim(claimToken, {
      email: 'ravi@ravi-machines.in',
      countryId: 101,
      stateId: 23,
      cityId: 2301,
    }, 'user-1'),
    { statusCode: 409, code: 'gst_claim_location_mismatch' },
  );
  assert.equal(consumed, false);
});

test('promotes a consumed signup claim to the canonical GST history record in the same transaction', async () => {
  const claimToken = 'b'.repeat(64);
  const canonicalCreates: any[] = [];
  const claimRecord = {
    id: 'claim-2',
    claimHash: hashSignupClaim(claimToken),
    status: 'SUCCESS',
    consumedAt: null,
    expiresAt: new Date(Date.now() + 60_000),
    signupEmailHash: hashSignupIdentity('ravi@ravi-machines.in', 'claim-secret'),
    signupMobileHash: null,
    countryId: 101,
    stateId: 22,
    cityId: 2201,
    gstin: '22AAHCJ5752E1ZR',
    maskedGstin: '22AA********1ZR',
    requestFingerprint: 'fingerprint',
    provider: 'SUREPASS',
    providerClientId: 'client-1',
    encryptedResult: encryptPanData(JSON.stringify({ gstin: '22AAHCJ5752E1ZR', businessName: 'Ravi Machines', gstinStatus: 'Active' }), dataSecret),
    rawDataExpiresAt: new Date(Date.now() + 60_000),
    completedAt: new Date(),
  };
  const claimRepository = {
    findFirst: async () => claimRecord,
    create: async () => ({}),
    update: async () => ({}),
    updateMany: async () => ({ count: 1 }),
  };
  const service = new PartnerSignupGstVerificationService({ dataSecret, claimSecret: 'claim-secret', provider: {} as any });

  const result = await service.consumeAndPromoteVerifiedClaim(
    claimToken,
    { email: 'ravi@ravi-machines.in', countryId: 101, stateId: 22, cityId: 2201 },
    'user-1',
    {
      partnerSignupGstVerification: claimRepository,
      gstVerificationRecord: {
        create: async ({ data }: any) => { canonicalCreates.push(data); return { id: 'gst-record-1', ...data }; },
      },
    },
  );

  assert.equal(result.verificationRecord.id, 'gst-record-1');
  assert.equal(canonicalCreates[0].requestedById, 'user-1');
  assert.equal(canonicalCreates[0].businessName, 'Ravi Machines');
  assert.equal(
    canonicalCreates[0].requestFingerprint,
    createVerificationFingerprint('GST_VERIFY', { id_number: claimRecord.gstin }),
  );
});
