import assert from 'node:assert/strict';
import test from 'node:test';
import { isPartnerListingDraftSave } from './listingDraftPolicy';

test('only an explicit partner draft request creates a completion-link draft', () => {
  assert.equal(isPartnerListingDraftSave({ role: 'PARTNER', status: 'DRAFT', saveAsDraft: true }), true);
  assert.equal(isPartnerListingDraftSave({ role: 'PARTNER', status: 'PUBLISHED', saveAsDraft: true }), false);
  assert.equal(isPartnerListingDraftSave({ role: 'EMPLOYEE', status: 'DRAFT', saveAsDraft: true }), false);
  assert.equal(isPartnerListingDraftSave({ role: 'PARTNER', status: 'DRAFT', saveAsDraft: false }), false);
});
