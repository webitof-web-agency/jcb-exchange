import assert from 'node:assert/strict';
import test from 'node:test';
import { buildCustomerListingNotificationText } from './listingNotificationText';

test('builds a concise listing notification without placeholder locations', () => {
  assert.deepEqual(
    buildCustomerListingNotificationText({
      title: 'Premium Excavator',
      categoryName: 'Excavator',
      brandName: 'JCB',
      modelName: '3DX',
      manufacturingYear: 2024,
      price: 1250000,
      locationCity: 'Not specified',
      locationState: 'Gujarat',
    }),
    {
      title: 'New Excavator listed: Premium Excavator',
      message: 'Rs 12.50 Lakh • Gujarat',
    },
  );
});

test('uses a useful fallback when listing details are incomplete', () => {
  assert.deepEqual(
    buildCustomerListingNotificationText({
      title: 'asdf',
      categoryName: 'Telehandler',
      brandName: 'Not specified',
      modelName: 'Not specified',
      manufacturingYear: null,
      price: 0,
      locationCity: 'Not specified',
      locationState: 'Not specified',
    }),
    {
      title: 'New Telehandler listed: asdf',
      message: 'Tap to view listing details',
    },
  );
});

