import assert from 'node:assert/strict';
import test from 'node:test';
import { getListingRtoOptionalTextFields } from './listingRtoDisplay';

test('returns populated optional RTO fields for the admin listing detail page', () => {
  assert.deepEqual(
    getListingRtoOptionalTextFields({ financerName: 'Finance Ltd', hsrpNumber: 'HSRP-12345' }),
    [
      ['Financer Name', 'Finance Ltd'],
      ['HSRP Number', 'HSRP-12345'],
    ],
  );
});

test('does not render empty optional RTO fields', () => {
  assert.deepEqual(getListingRtoOptionalTextFields({ financerName: ' ', hsrpNumber: null }), []);
});
