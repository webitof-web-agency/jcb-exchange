import test from 'node:test';
import assert from 'node:assert/strict';
import {
  applySourceTypeChange,
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
