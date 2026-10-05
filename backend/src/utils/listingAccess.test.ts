import assert from 'node:assert/strict';
import test from 'node:test';
import { canCreateListing, canEditListing } from './listingAccess';

test('allows admin listing pages to create listings and employees only with listing permissions', () => {
  assert.equal(canCreateListing('SUPER_ADMIN'), true);
  assert.equal(canCreateListing('ADMIN'), true);
  assert.equal(canCreateListing('EMPLOYEE', ['listings.create']), true);
  assert.equal(canCreateListing('EMPLOYEE', ['listings.update']), false);
  assert.equal(canCreateListing('CUSTOMER'), true);
  assert.equal(canCreateListing('PARTNER'), true);
});

test('allows admin listing pages to edit listings', () => {
  assert.equal(canEditListing('SUPER_ADMIN'), true);
  assert.equal(canEditListing('ADMIN'), true);
  assert.equal(canEditListing('EMPLOYEE', ['listings.update']), true);
  assert.equal(canEditListing('EMPLOYEE', ['listings.approve']), true);
  assert.equal(canEditListing('EMPLOYEE', ['listings.read']), false);

});
