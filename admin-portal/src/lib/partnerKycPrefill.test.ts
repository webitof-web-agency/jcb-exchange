import assert from 'node:assert/strict';
import test from 'node:test';
import { mergeVerifiedGstPrefill } from './partnerKycPrefill';

test('prefills missing KYC business identity and address from the verified GST result', () => {
  const profile = mergeVerifiedGstPrefill(
    {
      businessName: 'dealer1',
      businessAddress: '',
      city: '',
      state: '',
      pinCode: '',
    },
    {
      businessName: 'JCB Exchange Trade Name',
      legalName: 'JCB Exchange Private Limited',
      address: 'Shop No. 8, Housing Board Complex, Raipur, Chhattisgarh - 492004',
    },
    ['dealer1'],
  );

  assert.equal(profile.businessName, 'JCB Exchange Trade Name');
  assert.equal(profile.businessAddress, 'Shop No. 8, Housing Board Complex, Raipur, Chhattisgarh - 492004');
});

test('does not overwrite partner-entered KYC values with GST data', () => {
  const profile = mergeVerifiedGstPrefill(
    {
      businessName: 'My entered dealership',
      businessAddress: 'My operating address',
      city: 'Raipur',
      state: 'Chhattisgarh',
      pinCode: '492001',
    },
    {
      businessName: 'GST trade name',
      address: 'GST registered address',
    },
    ['dealer1'],
  );

  assert.equal(profile.businessName, 'My entered dealership');
  assert.equal(profile.businessAddress, 'My operating address');
  assert.equal(profile.city, 'Raipur');
  assert.equal(profile.pinCode, '492001');
});

test('leaves KYC profile unchanged when no verified GST result is available', () => {
  const original = {
    businessName: 'Existing dealership',
    businessAddress: '',
    city: '',
    state: '',
    pinCode: '',
  };

  assert.deepEqual(mergeVerifiedGstPrefill(original, null), original);
});
