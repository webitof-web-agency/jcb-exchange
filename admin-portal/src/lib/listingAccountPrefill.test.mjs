import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildAccountModuleUrl,
  getListingAccountLinkState,
  getListingAccountPrefill,
  isInternalAccountLinkRole,
  mergeListingAccountPrefill,
} from './listingAccountPrefill.mjs';

test('builds internal account links only for non-partner portal roles', () => {
  assert.equal(isInternalAccountLinkRole('EMPLOYEE'), true);
  assert.equal(isInternalAccountLinkRole('SUPER_ADMIN'), true);
  assert.equal(isInternalAccountLinkRole('PARTNER'), false);
  assert.equal(
    buildAccountModuleUrl('/employee/listings', 'rto-work-status', 'listing-1'),
    '/employee/accounts/rto-work-status?listingId=listing-1',
  );
});

test('maps listing data into safe RTO and sell-account prefill fields', () => {
  assert.deepEqual(
    getListingAccountPrefill({
      id: 'listing-1',
      title: 'JCB 3DX',
      ownerName: 'Owner Name',
      dealer: 'Dealer Name',
      category: { name: 'Backhoe Loader' },
      brand: { name: 'JCB' },
      model: { name: '3DX' },
      chassisNumber: 'CHASSIS-1',
      rtoRecords: [{ vehicleNumber: 'MH12AB1234' }],
    }),
    {
      listingId: 'listing-1',
      listingTitle: 'JCB 3DX',
      ownerName: 'Owner Name',
      ownerNumber: '',
      vehicleNumber: 'MH12AB1234',
      chassisNumber: 'CHASSIS-1',
      vehicleType: 'Backhoe Loader',
      brandName: 'JCB',
      vehicleModel: '3DX',
      sellerName: 'Dealer Name',
      sellerNumber: '',
      sellerState: '',
    },
  );
});

test('maps the listing location to seller state without guessing purchaser state', () => {
  const prefill = getListingAccountPrefill({ locationState: 'Chhattisgarh' });

  assert.equal(prefill.sellerState, 'Chhattisgarh');
});

test('ignores the backend placeholder state', () => {
  const prefill = getListingAccountPrefill({ locationState: 'Not specified' });

  assert.equal(prefill.sellerState, '');
});

test('does not use the listed-by phone as the owner mobile number', () => {
  const prefill = getListingAccountPrefill({
    id: 'listing-owner-number-missing',
    ownerName: 'Vehicle Owner',
    dealer: 'Listed By Partner',
    dealerPhone: '8966000253',
  });

  assert.equal(prefill.ownerNumber, '');
  assert.equal(prefill.sellerNumber, '8966000253');
});

test('uses an explicit listing owner number when the listing provides one', () => {
  const prefill = getListingAccountPrefill({
    ownerName: 'Vehicle Owner',
    ownerNumber: '9876543210',
    dealerPhone: '8966000253',
  });

  assert.equal(prefill.ownerNumber, '9876543210');
  assert.equal(prefill.sellerNumber, '8966000253');
});

test('does not prefill a manufacturing year as the vehicle model', () => {
  const prefill = getListingAccountPrefill({
    id: 'listing-2',
    title: 'JCB 3DX PLUS',
    manufacturingYear: 2022,
    brand: { id: 'brand-1', name: 'JCB' },
    model: { id: 'model-1', name: '2022' },
    category: { id: 'category-1', name: 'Backhoe Loader' },
  });

  assert.equal(prefill.brandName, 'JCB');
  assert.equal(prefill.vehicleModel, '3DX PLUS');
  assert.equal(prefill.vehicleType, 'Backhoe Loader');
});

test('repairs missing brand and legacy year-only model on an existing linked record', () => {
  const merged = mergeListingAccountPrefill(
    {
      listingId: 'listing-2',
      brandName: '',
      vehicleModel: '2022',
      vehicleType: 'Backhoe Loader',
      vehicleNumber: 'CG13AS2642',
    },
    {
      listingId: 'listing-2',
      listingTitle: 'JCB 3DX PLUS',
      brandName: 'JCB',
      vehicleModel: '3DX PLUS',
      vehicleType: 'Backhoe Loader',
    },
  );

  assert.equal(merged.brandName, 'JCB');
  assert.equal(merged.vehicleModel, '3DX PLUS');
  assert.equal(merged.vehicleNumber, 'CG13AS2642');
});

test('reports whether each listing account module should open in create or edit mode', () => {
  assert.deepEqual(
    getListingAccountLinkState('listing-2', {
      rtoRecords: [{ listingId: 'listing-2' }],
      sellRecords: [],
    }),
    { rtoExists: true, sellExists: false },
  );
});
