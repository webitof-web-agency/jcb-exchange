import assert from 'node:assert/strict';
import test from 'node:test';
import { canCreateListing, canEditListing, canBypassListingVerification } from './listingAccess';

test('allows super admins, partners, and eligible customers to create listings', () => {
  assert.equal(canCreateListing('SUPER_ADMIN'), true);
  assert.equal(canCreateListing('ADMIN'), false);
  assert.equal(canCreateListing('EMPLOYEE', ['listings.create']), false);
  assert.equal(canCreateListing('EMPLOYEE', ['listings.update']), false);
  assert.equal(canCreateListing('CUSTOMER'), true);
  assert.equal(canCreateListing('PARTNER'), true);
});

test('allows managed roles to create listings only when their platform toggle is enabled', () => {
  const adminEnabled = { allowAdmin: true, allowEmployee: false };
  const employeeEnabled = { allowAdmin: false, allowEmployee: true };

  assert.equal(canCreateListing('ADMIN', [], adminEnabled), true);
  assert.equal(canCreateListing('EMPLOYEE', [], adminEnabled), false);
  assert.equal(canCreateListing('ADMIN', [], employeeEnabled), false);
  assert.equal(canCreateListing('EMPLOYEE', [], employeeEnabled), true);
});

test('allows admin listing pages to edit listings', () => {
  assert.equal(canEditListing('SUPER_ADMIN'), true);
  assert.equal(canEditListing('ADMIN'), true);
  assert.equal(canEditListing('EMPLOYEE', ['listings.update']), true);
  assert.equal(canEditListing('EMPLOYEE', ['listings.approve']), true);
  assert.equal(canEditListing('EMPLOYEE', ['listings.read']), false);

});

test('keeps vehicle verification bypass restricted to admins or explicit employee permission', () => {
  assert.equal(canBypassListingVerification('SUPER_ADMIN'), true);
  assert.equal(canBypassListingVerification('ADMIN'), true);
  assert.equal(canBypassListingVerification('EMPLOYEE', ['listings.update']), false);
  assert.equal(canBypassListingVerification('EMPLOYEE', ['listings.verification.bypass']), true);
});
