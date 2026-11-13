import test from 'node:test';
import assert from 'node:assert/strict';
import { messageVariableValue, partnerDisplayName, shortRecordRef } from './messageDisplayValues';

test('partner is shown as "Business name (Owner name)"', () => {
  assert.equal(partnerDisplayName({ businessName: 'Shree Ganesh Earthmovers', ownerName: 'Ramesh Sahu' }), 'Shree Ganesh Earthmovers (Ramesh Sahu)');
  assert.equal(partnerDisplayName({ businessName: 'Shree Ganesh Earthmovers', ownerName: '' }), 'Shree Ganesh Earthmovers');
  assert.equal(partnerDisplayName({ businessName: null, ownerName: 'Ramesh Sahu' }), 'Ramesh Sahu');
  assert.equal(partnerDisplayName({ businessName: 'Ramesh Sahu', ownerName: 'ramesh sahu' }), 'Ramesh Sahu');
  assert.equal(partnerDisplayName({}), '');
});

test('record UUIDs are shortened to the 13-character slug suffix', () => {
  assert.equal(shortRecordRef('34d5397a-908a-4d31-b359-fedafedcbd19'), '34D5397A-908A');
  assert.equal(shortRecordRef('JCBP-0012'), 'JCBP-0012');
  assert.equal(shortRecordRef(undefined), '');
});

test('KYC partner variable prefers the display name over code and raw id', () => {
  const id = '3f16b7b9-c002-4896-b950-1d1169c363d5';
  assert.equal(messageVariableValue('partnerId', { partnerId: id, partnerCode: 'JCBP-0012', partnerDisplayName: 'Shree Ganesh Earthmovers (Ramesh Sahu)' }), 'Shree Ganesh Earthmovers (Ramesh Sahu)');
  assert.equal(messageVariableValue('partnerId', { partnerId: id, partnerCode: 'JCBP-0012' }), 'JCBP-0012');
  assert.equal(messageVariableValue('partnerId', { partnerId: id }), '3F16B7B9-C002');
});

test('listing and payment ids are readable', () => {
  const listingId = '34d5397a-908a-4d31-b359-fedafedcbd19';
  assert.equal(messageVariableValue('listingId', { listingId }), '34D5397A-908A');
  assert.equal(messageVariableValue('paymentId', { paymentId: '8421a5e8-68ec-4f00-9c3c-0b1b8a3e9d11', paymentRef: 'UTR123456789' }), 'UTR123456789');
  assert.equal(messageVariableValue('paymentId', { paymentId: '8421a5e8-68ec-4f00-9c3c-0b1b8a3e9d11' }), '8421A5E8-68EC');
  assert.equal(messageVariableValue('listingTitle', { listingTitle: 'JCB 3DX 2020' }), 'JCB 3DX 2020');
});
