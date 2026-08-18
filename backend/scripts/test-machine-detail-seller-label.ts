import assert from 'node:assert/strict';
import { getMarketplaceSellerPresentation } from '../src/utils/publicListingVisibility';

const customerSeller = getMarketplaceSellerPresentation({
  role: 'CUSTOMER',
  name: 'Shaurya Kumar',
  partnerProfile: null,
});

assert.equal(customerSeller.partnerType, null, 'customer sellers should not be tagged as dealer');
assert.equal(customerSeller.displayName, 'Shaurya Kumar', 'customer seller name should stay intact');

const partnerSeller = getMarketplaceSellerPresentation({
  role: 'PARTNER',
  name: 'Fallback Name',
  partnerProfile: {
    businessName: 'Amar Earthmovers',
    partnerType: 'SHOWROOM',
  },
});

assert.equal(partnerSeller.partnerType, 'SHOWROOM', 'approved partners should preserve partner type');
assert.equal(partnerSeller.displayName, 'Amar Earthmovers', 'partner business name should be preferred');

console.log('machine detail seller presentation checks passed.');
