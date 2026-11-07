import assert from 'node:assert/strict';
import test from 'node:test';
import { extractGstVerifiedProfileFields } from './gstVerifiedProfileFields';

test('extracts durable verified contact fields from the retained GST result', () => {
  assert.deepEqual(extractGstVerifiedProfileFields({
    contactDetails: {
      principal: {
        mobile_number: '8319811884',
        email: 'officialhitesh.aryan@gmail.com',
        address: '3, 3033, Currency Tower, VIP Road',
      },
    },
    providerData: {
      contact_details: {
        principal: {
          mobile_number: '8319811884',
          email: 'officialhitesh.aryan@gmail.com',
          address: '3, 3033, Currency Tower, VIP Road',
        },
      },
    },
    address: '3, 3033, Currency Tower, VIP Road, Telibandha, Raipur, Chhattisgarh, 492001',
  }), {
    mobile: '8319811884',
    email: 'officialhitesh.aryan@gmail.com',
    address: '3, 3033, Currency Tower, VIP Road, Telibandha, Raipur, Chhattisgarh, 492001',
  });
});
