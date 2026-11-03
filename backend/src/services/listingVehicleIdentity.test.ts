import assert from 'node:assert/strict';
import test from 'node:test';
import {
  assessVehicleIdentity,
  resolveListingVehicleKeys,
  serializeVehicleIdentityForSeller,
  toVehicleIdentityKey,
  type VehicleIdentityMatches,
  type VehicleListingMatch,
} from './listingVehicleIdentity';

const listing = (overrides: Partial<VehicleListingMatch>): VehicleListingMatch => ({
  listingId: 'other-listing',
  title: 'JCB 3DX',
  status: 'PUBLISHED',
  partnerId: 'other-seller',
  partnerName: 'Other Seller',
  createdAt: new Date('2026-01-01'),
  keys: { registrationNumberKey: 'MH12AB1234', chassisNumberKey: 'JCB3DX0001' },
  matchedOn: ['registration', 'chassis'],
  sale: null,
  ...overrides,
});

const assess = (matches: VehicleIdentityMatches, extra: Partial<Parameters<typeof assessVehicleIdentity>[0]> = {}) =>
  assessVehicleIdentity({
    registrationKey: 'MH12AB1234',
    chassisKey: 'JCB3DX0001',
    ownerUserId: 'seller',
    matches,
    ...extra,
  });

test('normalizes vehicle numbers and ignores placeholders and masked values', () => {
  assert.equal(toVehicleIdentityKey(' mh-12 ab/1234 '), 'MH12AB1234');
  assert.equal(toVehicleIdentityKey('NA'), null);
  assert.equal(toVehicleIdentityKey('Not Available'), null);
  assert.equal(toVehicleIdentityKey('MAT448****12345'), null);
  assert.equal(toVehicleIdentityKey(undefined), null);
});

test('prefers the first usable candidate', () => {
  assert.deepEqual(
    resolveListingVehicleKeys({ registration: ['', 'NA', 'mh12ab1234'], chassis: ['jcb3dx0001', 'OTHER12345'] }),
    { registrationNumberKey: 'MH12AB1234', chassisNumberKey: 'JCB3DX0001' },
  );
});

test('a vehicle with no other records is unique', () => {
  const result = assess({ listings: [], soldRecords: [] });
  assert.equal(result.blocked, false);
  assert.equal(result.registration.state, 'UNIQUE');
  assert.equal(result.chassis.state, 'UNIQUE');
  assert.equal(result.isResale, false);
});

test('an open listing of the same vehicle blocks, on either number', () => {
  for (const status of ['PENDING_APPROVAL', 'CHANGES_REQUESTED', 'PUBLISHED', 'PAUSED', 'RESERVED']) {
    const result = assess({ listings: [listing({ status, matchedOn: ['chassis'] })], soldRecords: [] });
    assert.equal(result.blocked, true, status);
    assert.equal(result.registration.state, 'UNIQUE');
    assert.equal(result.chassis.state, 'ALREADY_LISTED');
    assert.equal(result.blockingField, 'chassis');
  }
});

test('only the owner is blocked by a draft', () => {
  const draft = listing({ status: 'DRAFT', partnerId: 'seller' });
  assert.equal(assess({ listings: [draft], soldRecords: [] }).registration.state, 'OWN_DRAFT');

  const someoneElses = assess({ listings: [listing({ status: 'DRAFT' })], soldRecords: [] });
  assert.equal(someoneElses.blocked, false);
  assert.equal(someoneElses.otherDrafts.length, 1);
});

test('a sold vehicle can be listed again and is marked as a resale', () => {
  const sold = listing({
    status: 'SOLD',
    sale: { soldAt: new Date('2026-03-01'), buyerName: 'Ravi', buyerPhone: '+91 98765 43210', listingId: 'other-listing', recordNumber: 'SA-1' },
  });
  const result = assess({ listings: [sold, listing({ status: 'REJECTED', listingId: 'rejected' })], soldRecords: [] }, { sellerPhone: '9876543210' });
  assert.equal(result.blocked, false);
  assert.equal(result.registration.state, 'PREVIOUSLY_SOLD');
  assert.equal(result.isResale, true);
  assert.equal(result.lastSale?.recordNumber, 'SA-1');
  assert.equal(result.sellerIsLastBuyer, true);
  assert.equal(assess({ listings: [sold], soldRecords: [] }, { sellerPhone: '9000000000' }).sellerIsLastBuyer, false);
});

test('an offline Sold Vehicle record also counts as a previous sale', () => {
  const result = assess({
    listings: [],
    soldRecords: [{
      sellAccountId: 'sale',
      listingId: null,
      keys: { registrationNumberKey: 'MH12AB1234', chassisNumberKey: null },
      matchedOn: ['registration'],
      sale: { soldAt: new Date('2026-02-01'), buyerName: 'Asha', buyerPhone: null, listingId: null, recordNumber: 'SA-2' },
    }],
  });
  assert.equal(result.registration.state, 'PREVIOUSLY_SOLD');
  assert.equal(result.chassis.state, 'UNIQUE');
  assert.equal(result.sellerIsLastBuyer, null);
});

test('sales after the cutoff are not previous sales', () => {
  const sold = listing({ status: 'SOLD', sale: { soldAt: new Date('2026-06-01'), buyerName: null, buyerPhone: null, listingId: 'x', recordNumber: null } });
  const result = assess({ listings: [sold], soldRecords: [] }, { saleCutoff: new Date('2026-05-01') });
  assert.equal(result.isResale, false);
  assert.equal(result.registration.state, 'UNIQUE');
});

test('sellers are never told about resales or other sellers', () => {
  const sold = listing({ status: 'SOLD', sale: { soldAt: new Date('2026-03-01'), buyerName: 'Ravi', buyerPhone: '9876543210', listingId: 'x', recordNumber: 'SA-1' } });
  const resale = serializeVehicleIdentityForSeller(assess({ listings: [sold], soldRecords: [] }), 'seller');
  assert.equal(resale.registration.state, 'UNIQUE');
  assert.equal(JSON.stringify(resale).includes('Ravi'), false);

  const taken = serializeVehicleIdentityForSeller(assess({ listings: [listing({})], soldRecords: [] }), 'seller');
  assert.equal(taken.blocked, true);
  assert.equal('listingId' in taken.registration, false);

  const own = serializeVehicleIdentityForSeller(assess({ listings: [listing({ partnerId: 'seller' })], soldRecords: [] }), 'seller');
  assert.equal(own.registration.listingId, 'other-listing');
});
