import assert from 'node:assert/strict';
import test from 'node:test';
import { getListingFormTabs } from './listingFormTabs';

test('partner listing form exposes the same core sections as the admin form', () => {
  const tabs = getListingFormTabs('AVAILABLE', 3, false);

  assert.deepEqual(tabs.map((tab) => tab.key), ['equipment', 'rto', 'media', 'pricing']);
  assert.equal(tabs.find((tab) => tab.key === 'media')?.badge, '3/14');
});

test('sold listings add the confidential buyer and sale section', () => {
  const tabs = getListingFormTabs('SOLD', 14, true);

  assert.deepEqual(tabs.map((tab) => tab.key), ['equipment', 'rto', 'media', 'pricing', 'sale']);
  assert.equal(tabs.find((tab) => tab.key === 'media')?.badgeColor, 'complete');
});
