import assert from 'node:assert/strict';
import test from 'node:test';
import { PartnerGstReverificationService } from './partnerGstReverification.service';

test('links a newly verified GST record, supersedes the old record, and writes an audit entry', async () => {
  const calls = { profileUpdate: [] as any[], gstUpdate: [] as any[], audit: [] as any[], notification: [] as any[] };
  const current = { id: 'profile-1', userId: 'partner-1', gstNumber: '22AAAAA0000A1Z5', gstVerificationRecordId: 'old-record', gstVerifiedAt: new Date('2026-01-01') };
  const tx = {
    partnerProfile: {
      findUnique: async () => current,
      update: async ({ data }: any) => { calls.profileUpdate.push(data); return { ...current, ...data }; },
    },
    gstVerificationRecord: { update: async ({ data }: any) => { calls.gstUpdate.push(data); return data; } },
    auditLog: { create: async ({ data }: any) => { calls.audit.push(data); return data; } },
    notification: { create: async ({ data }: any) => { calls.notification.push(data); return data; } },
  };
  const service = new PartnerGstReverificationService({
    db: { partnerProfile: { findUnique: async () => current }, $transaction: async (callback: any) => callback(tx) },
    verifyGstin: async () => ({
      record: { id: 'new-record', status: 'SUCCESS' },
      result: {
        address: 'Verified GST address',
        contactDetails: { principal: { mobile_number: '9876543210', email: 'gst@example.com' } },
      },
    }),
  });

  const result = await service.reverify({ partnerUserId: 'partner-1', actorUserId: 'admin-1', gstin: '22AAHCJ5752E1ZR', reason: 'Corrected GST submitted by dealer.' });
  assert.equal(result.verificationRecordId, 'new-record');
  assert.equal(calls.profileUpdate[0].gstNumber, '22AAHCJ5752E1ZR');
  assert.equal(calls.profileUpdate[0].gstVerificationRecordId, 'new-record');
  assert.equal(calls.profileUpdate[0].gstVerifiedMobile, '9876543210');
  assert.equal(calls.profileUpdate[0].gstVerifiedEmail, 'gst@example.com');
  assert.equal(calls.profileUpdate[0].gstVerifiedAddress, 'Verified GST address');
  assert.equal(calls.gstUpdate[0].supersededByRecordId, 'new-record');
  assert.equal(calls.audit[0].action, 'PARTNER_GST_REVERIFIED');
  assert.equal(calls.notification[0].userId, 'partner-1');
});

test('requires an explicit re-verification reason before calling the provider', async () => {
  let providerCalls = 0;
  const service = new PartnerGstReverificationService({
    db: { partnerProfile: { findUnique: async () => null } },
    verifyGstin: async () => { providerCalls += 1; return {}; },
  });
  await assert.rejects(
    () => service.reverify({ partnerUserId: 'partner-1', actorUserId: 'admin-1', gstin: '22AAHCJ5752E1ZR', reason: 'no' }),
    { code: 'invalid_reason' },
  );
  assert.equal(providerCalls, 0);
});
