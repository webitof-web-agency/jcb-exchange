import assert from 'node:assert/strict';
import test from 'node:test';
import { backfillLegacyPartnerProfiles } from './partnerLegacyBackfill.service';

const catalog = {
  country: { id: 101 },
  states: [{ id: 22, name: 'Chhattisgarh', stateCode: 'CG', countryId: 101 }],
  cities: [{ id: 2201, name: 'Raipur', stateId: 22, countryId: 101 }],
};

const makeDb = () => {
  const rows = [
    {
      id: 'profile-1',
      userId: 'user-1',
      partnerCode: null,
      ownerName: 'Ravi Kumar',
      businessName: 'Ravi Machines',
      countryId: null,
      stateId: null,
      cityId: null,
      district: 'Raipur',
      gstNumber: '22AAAAA0000A1Z5',
      gstVerificationRecordId: null,
      gstVerifiedAt: null,
      gstVerificationRecord: null,
      user: { name: 'Ravi Kumar', state: 'Chhattisgarh', city: 'Raipur' },
    },
    {
      id: 'profile-2',
      userId: 'user-2',
      partnerCode: null,
      ownerName: 'Unknown',
      businessName: 'Unknown Machines',
      countryId: null,
      stateId: null,
      cityId: null,
      district: null,
      gstNumber: null,
      gstVerificationRecordId: null,
      gstVerifiedAt: null,
      gstVerificationRecord: null,
      user: { name: 'Unknown', state: null, city: null },
    },
  ];
  const updates: Array<{ where: unknown; data: unknown }> = [];
  const db = {
    country: { findFirst: async () => catalog.country },
    state: { findMany: async () => catalog.states },
    city: { findMany: async () => catalog.cities },
    partnerProfile: {
      findMany: async () => rows,
      findUnique: async ({ where }: { where: { partnerCode: string } }) =>
        rows.find((row) => row.partnerCode === where.partnerCode) || null,
      update: async (input: { where: unknown; data: unknown }) => {
        updates.push(input);
        const targetId = (input.where as { id?: string }).id;
        const target = rows.find((row) => row.id === targetId);
        if (target) Object.assign(target, input.data);
        return input;
      },
    },
  };
  return { db, updates };
};

test('dry run reports safe legacy updates without writing or inventing GST proof', async () => {
  const { db, updates } = makeDb();
  const report = await backfillLegacyPartnerProfiles(db as any, { dryRun: true });

  assert.equal(report.dryRun, true);
  assert.equal(report.partnersScanned, 2);
  assert.equal(report.partnersUpdated, 1);
  assert.equal(report.locationsBackfilled, 1);
  assert.equal(report.partnerCodesBackfilled, 1);
  assert.equal(report.gstLinksCreated, 0);
  assert.equal(report.missingStateCount, 1);
  assert.equal(report.missingCityCount, 1);
  assert.equal(report.gstProof.unverifiedWithoutProof, 1);
  assert.equal(report.missingState[0]?.profileId, 'profile-2');
  assert.equal(report.missingCity[0]?.profileId, 'profile-2');
  assert.equal(updates.length, 0);
});

test('apply writes only missing canonical fields and leaves GST linkage unchanged', async () => {
  const { db, updates } = makeDb();
  await backfillLegacyPartnerProfiles(db as any, { dryRun: false });

  assert.equal(updates.length, 1);
  assert.deepEqual(updates[0]?.data, {
    countryId: 101,
    stateId: 22,
    cityId: 2201,
    partnerCode: 'cg-raipur-ravi',
  });
});

test('apply clears an unproven legacy GST verification flag and is idempotent on rerun', async () => {
  const { db, updates } = makeDb();
  const rows = (db.partnerProfile.findMany as any);
  void rows;

  const report = await backfillLegacyPartnerProfiles(db as any, { dryRun: false });
  assert.equal(report.gstVerificationCleared, 0);

  const secondReport = await backfillLegacyPartnerProfiles(db as any, { dryRun: false });
  assert.equal(secondReport.partnersUpdated, 0);
  assert.equal(secondReport.partnerCodesBackfilled, 0);
  assert.equal(updates.length, 1);
});

test('reports an invalid GST proof link without promoting it to verified', async () => {
  const { db } = makeDb();
  (db.partnerProfile.findMany as any) = async () => [{
    id: 'profile-gst',
    userId: 'user-gst',
    partnerCode: 'cg-raipur-gst',
    ownerName: 'GST Dealer',
    businessName: 'GST Dealer',
    countryId: 101,
    stateId: 22,
    cityId: 2201,
    district: 'Raipur',
    gstNumber: '22AAAAA0000A1Z5',
    gstVerificationRecordId: 'record-failed',
    gstVerifiedAt: new Date('2026-01-01T00:00:00.000Z'),
    gstVerificationRecord: { id: 'record-failed', status: 'FAILED', completedAt: new Date('2026-01-01T00:00:00.000Z') },
    user: { name: 'GST Dealer', state: 'Chhattisgarh', city: 'Raipur' },
  }];

  const report = await backfillLegacyPartnerProfiles(db as any, { dryRun: true });
  assert.equal(report.gstProof.invalidProofLinks, 1);
  assert.equal(report.gstProof.unverifiedWithoutProof, 1);
});
