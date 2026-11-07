import assert from 'node:assert/strict';
import test from 'node:test';
import {
  ARCHIVE_PARTNER_CONFIRMATION,
  archivePartnerUser,
  buildPartnerArchiveMutation,
  buildPartnerRestoreMutation,
  buildPartnerEditAudit,
  restorePartnerUser,
  validatePartnerArchiveRequest,
} from './partnerArchive.service';

test('partner archive requires a reason and explicit confirmation', () => {
  assert.throws(
    () => validatePartnerArchiveRequest({ reason: '', confirmation: ARCHIVE_PARTNER_CONFIRMATION }),
    /reason/i,
  );
  assert.throws(
    () => validatePartnerArchiveRequest({ reason: 'Duplicate partner', confirmation: 'yes' }),
    /confirmation/i,
  );

  assert.deepEqual(
    validatePartnerArchiveRequest({
      reason: 'Duplicate partner account reported by operations.',
      confirmation: ARCHIVE_PARTNER_CONFIRMATION,
    }),
    { reason: 'Duplicate partner account reported by operations.', confirmation: ARCHIVE_PARTNER_CONFIRMATION },
  );
});

test('archive mutation closes the account but never changes the immutable user or partner IDs', () => {
  const mutation = buildPartnerArchiveMutation({
    currentStatus: 'ACTIVE',
    actorUserId: 'admin-1',
    reason: 'Compliance review requested archive.',
    archivedAt: new Date('2026-11-05T10:00:00.000Z'),
  });

  assert.deepEqual(mutation, {
    status: 'CLOSED',
    archivedAt: new Date('2026-11-05T10:00:00.000Z'),
    archiveReason: 'Compliance review requested archive.',
    archivedById: 'admin-1',
    archivedFromStatus: 'ACTIVE',
    restoredAt: null,
    restoredById: null,
  });
});

test('restore returns the prior account status and keeps archive history metadata', () => {
  const mutation = buildPartnerRestoreMutation({
    archivedFromStatus: 'SUSPENDED',
    actorUserId: 'admin-2',
    restoredAt: new Date('2026-11-05T11:00:00.000Z'),
  });

  assert.deepEqual(mutation, {
    status: 'SUSPENDED',
    restoredAt: new Date('2026-11-05T11:00:00.000Z'),
    restoredById: 'admin-2',
    archivedAt: null,
    archivedFromStatus: null,
  });
});

test('partner edit audit excludes immutable IDs and sensitive fields', () => {
  const audit = buildPartnerEditAudit(
    {
      id: 'user-1',
      partnerCode: 'cg-raipur-ravi',
      name: 'Ravi',
      email: 'old@example.com',
      password: 'secret',
      businessName: 'Old Machines',
    },
    {
      id: 'user-1',
      partnerCode: 'cg-raipur-ravi',
      name: 'Ravi Kumar',
      email: 'new@example.com',
      password: 'new-secret',
      businessName: 'New Machines',
    },
  );

  assert.deepEqual(audit, {
    changed: true,
    before: { name: 'Ravi', email: 'old@example.com', businessName: 'Old Machines' },
    after: { name: 'Ravi Kumar', email: 'new@example.com', businessName: 'New Machines' },
  });
});

test('archive and restore update only lifecycle state while preserving the partner identity', async () => {
  const state: any = {
    id: 'user-1',
    role: 'PARTNER',
    status: 'ACTIVE',
    name: 'Ravi',
    email: 'ravi@example.com',
    mobile: '9000000000',
    archivedAt: null,
    archiveReason: null,
    archivedFromStatus: null,
    partnerProfile: {
      id: 'profile-1',
      partnerCode: 'cg-raipur-ravi',
      businessName: 'Ravi Machines',
      accountStatus: 'ACTIVE',
      onboardingStatus: 'APPROVED',
      kycStatus: 'APPROVED',
    },
  };
  const audits: any[] = [];
  const notifications: any[] = [];
  const db: any = {
    user: {
      findUnique: async () => state,
      update: async ({ data }: any) => Object.assign(state, data),
    },
    partnerProfile: {
      update: async ({ data }: any) => Object.assign(state.partnerProfile, data),
    },
    auditLog: { create: async ({ data }: any) => audits.push(data) },
    notification: { create: async ({ data }: any) => notifications.push(data) },
    $transaction: async (callback: (tx: any) => Promise<unknown>) => callback(db),
  };

  await archivePartnerUser({
    db,
    partnerId: 'user-1',
    actorUserId: 'admin-1',
    request: { reason: 'Compliance closure requested.', confirmation: ARCHIVE_PARTNER_CONFIRMATION },
  });

  assert.equal(state.id, 'user-1');
  assert.equal(state.partnerProfile.partnerCode, 'cg-raipur-ravi');
  assert.equal(state.status, 'CLOSED');
  assert.equal(state.partnerProfile.accountStatus, 'CLOSED');
  assert.equal(audits[0].action, 'PARTNER_ARCHIVED');

  await restorePartnerUser({ db, partnerId: 'user-1', actorUserId: 'admin-1' });

  assert.equal(state.status, 'ACTIVE');
  assert.equal(state.partnerProfile.accountStatus, 'ACTIVE');
  assert.equal(state.archivedAt, null);
  assert.equal(state.partnerProfile.partnerCode, 'cg-raipur-ravi');
  assert.deepEqual(audits.map((audit) => audit.action), ['PARTNER_ARCHIVED', 'PARTNER_RESTORED']);
  assert.equal(notifications.length, 2);
});
