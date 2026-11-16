import assert from 'node:assert/strict';
import test from 'node:test';
import {
  canSubmitCompletionForPartnerReview,
  isCompletionWaitingForPartnerReview,
  normalizePartnerDraftSubmissionStatus,
} from './listingCompletionReviewPolicy';

test('owner completion stays private until the partner submits it for review', () => {
  assert.equal(isCompletionWaitingForPartnerReview({ listingStatus: 'DRAFT', inviteStatus: 'SUBMITTED' }), true);
  assert.equal(canSubmitCompletionForPartnerReview({ listingStatus: 'DRAFT', inviteStatus: 'SUBMITTED' }), true);
});

test('completion cannot bypass the partner review gate', () => {
  assert.equal(isCompletionWaitingForPartnerReview({ listingStatus: 'PENDING_APPROVAL', inviteStatus: 'SUBMITTED' }), false);
  assert.equal(canSubmitCompletionForPartnerReview({ listingStatus: 'DRAFT', inviteStatus: 'ACTIVE' }), false);
  assert.equal(canSubmitCompletionForPartnerReview({ listingStatus: 'PUBLISHED', inviteStatus: 'SUBMITTED' }), false);
});

test('a partner draft can never be published directly', () => {
  assert.equal(normalizePartnerDraftSubmissionStatus({ role: 'PARTNER', currentStatus: 'DRAFT', requestedStatus: 'PUBLISHED' }), 'PENDING_APPROVAL');
  assert.equal(normalizePartnerDraftSubmissionStatus({ role: 'PARTNER', currentStatus: 'DRAFT', requestedStatus: 'DRAFT' }), 'DRAFT');
  assert.equal(normalizePartnerDraftSubmissionStatus({ role: 'SUPER_ADMIN', currentStatus: 'DRAFT', requestedStatus: 'PUBLISHED' }), 'PUBLISHED');
});
