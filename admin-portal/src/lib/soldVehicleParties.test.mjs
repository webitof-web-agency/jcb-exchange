import test from 'node:test';
import assert from 'node:assert/strict';
import {
  applySourceTypeChange,
  fillBlankFields,
  getListingDealParties,
  JCB_EXCHANGE_BROKER,
  JCB_EXCHANGE_COMPANY_NAME,
  resolveListingSourceType,
} from './soldVehicleParties.mjs';

test('detects who the vehicle was bought from by the listing creator role', () => {
  assert.equal(resolveListingSourceType({ partner: { role: 'PARTNER', partnerProfile: { partnerType: 'SHOWROOM' } } }), 'PARTNER');
  assert.equal(resolveListingSourceType({ partner: { role: 'PARTNER', partnerProfile: { partnerType: 'BROKER' } } }), 'AGENT');
  assert.equal(resolveListingSourceType({ partner: { role: 'CUSTOMER' } }), 'DIRECT_CUSTOMER');
  assert.equal(resolveListingSourceType({ partner: { role: 'SUPER_ADMIN' } }), 'JCB_EXCHANGE');
  assert.equal(resolveListingSourceType({}), '');
});

test('prefills the purchase side from a partner listing and keeps JCB Exchange as broker', () => {
  const parties = getListingDealParties({
    dealer: 'Gujarat Heavy Infra',
    dealerPhone: '+91 98220 11223',
    locationCity: 'Raipur',
    locationState: 'Chhattisgarh',
    price: '2550000',
    partner: { role: 'PARTNER', partnerProfile: { partnerType: 'SHOWROOM' } },
  });
  assert.equal(parties.sourceType, 'PARTNER');
  assert.equal(parties.sellerName, 'Gujarat Heavy Infra');
  assert.equal(parties.sellerNumber, '9822011223');
  assert.equal(parties.sellerState, 'Chhattisgarh');
  assert.equal(parties.brokerName, JCB_EXCHANGE_BROKER.name);
  assert.equal(parties.brokerNumber, '9183433895');
  assert.equal(parties.listedPrice, 2550000);
});

test('uses JCB Exchange on the purchase side for an admin-listed vehicle', () => {
  const parties = getListingDealParties({ dealer: 'Admin User', partner: { role: 'ADMIN' }, locationState: 'Not specified' });
  assert.equal(parties.sourceType, 'JCB_EXCHANGE');
  assert.equal(parties.sellerName, JCB_EXCHANGE_COMPANY_NAME);
  assert.equal(parties.sellerNumber, JCB_EXCHANGE_BROKER.number);
  assert.equal(parties.sellerState, '');
});

test('switching away from own stock clears the JCB Exchange purchase placeholder', () => {
  const ownStock = applySourceTypeChange({ sourceType: 'PARTNER', sellerName: 'X', sellerNumber: '1' }, 'JCB_EXCHANGE');
  assert.equal(ownStock.sellerName, JCB_EXCHANGE_COMPANY_NAME);
  const agent = applySourceTypeChange(ownStock, 'AGENT');
  assert.equal(agent.sellerName, '');
  assert.equal(agent.sourceType, 'AGENT');
  const kept = applySourceTypeChange({ sourceType: 'PARTNER', sellerName: 'Typed Name' }, 'AGENT');
  assert.equal(kept.sellerName, 'Typed Name');
});

test('uses the seller price (without admin margin) as the purchase amount and carries listing expenses', () => {
  const parties = getListingDealParties({
    price: '1000000',
    adminMarginAmount: '100000',
    adminExpenseBreakdown: { transport: 20000, paperwork: 5000, rtoWork: 0, other: 0, otherLabel: '' },
    partner: { role: 'PARTNER', partnerProfile: { partnerType: 'SHOWROOM' } },
  });
  assert.equal(parties.purchaseAmount, 1000000);
  assert.deepEqual(parties.expenseBreakdown, { transport: 20000, paperwork: 5000, rtoWork: 0, other: 0, otherLabel: '' });

  const plainExpenses = getListingDealParties({ price: 500000, adminExpenseAmount: '7000', partner: { role: 'CUSTOMER' } });
  assert.equal(plainExpenses.expenseBreakdown.other, 7000);
});

test('leaves the purchase amount blank for own stock and expenses null when none were added', () => {
  const parties = getListingDealParties({ price: 900000, partner: { role: 'SUPER_ADMIN' } });
  assert.equal(parties.purchaseAmount, 0);
  assert.equal(parties.listedPrice, 900000);
  assert.equal(parties.expenseBreakdown, null);
});

test('fills only the blank fields of an existing record', () => {
  const empty = { transport: 0, paperwork: 0, rtoWork: 0, other: 0, otherLabel: '' };
  const merged = fillBlankFields(
    { sellAmount: 0, purchaseAmount: 750000, purchaserName: '', ownerName: 'Typed', expenseBreakdown: empty },
    { sellAmount: 1200000, purchaseAmount: 800000, purchaserName: 'Ramesh', ownerName: 'Listing Owner', expenseBreakdown: { ...empty, transport: 15000 } },
  );
  assert.equal(merged.sellAmount, 1200000);
  assert.equal(merged.purchaseAmount, 750000);
  assert.equal(merged.purchaserName, 'Ramesh');
  assert.equal(merged.ownerName, 'Typed');
  assert.equal(merged.expenseBreakdown.transport, 15000);
});
