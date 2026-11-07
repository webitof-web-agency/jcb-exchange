import assert from 'node:assert/strict';
import test from 'node:test';
import {
  getLatestPartnerDecision,
  getPartnerDecisionRemark,
} from './partnerDecisionPresentation';

const reviewHistory = [
  {
    id: 'approved-1',
    action: 'SUPER_ADMIN_APPROVED',
    comment: 'GST and KYC documents verified. Account approved for listing activities.',
    createdAt: '2026-11-07T10:00:00.000Z',
  },
  {
    id: 'submitted-1',
    action: 'PARTNER_SUBMITTED_FULL_ONBOARDING',
    comment: 'Partner submitted full onboarding package for review.',
    createdAt: '2026-11-07T09:00:00.000Z',
  },
];

test('selects the latest super-admin decision for the partner compliance card', () => {
  assert.deepEqual(getLatestPartnerDecision(reviewHistory), {
    id: 'approved-1',
    status: 'APPROVED',
    action: 'SUPER_ADMIN_APPROVED',
    comment: 'GST and KYC documents verified. Account approved for listing activities.',
    createdAt: '2026-11-07T10:00:00.000Z',
  });
});

test('returns a professional fallback when an approved decision has no remark', () => {
  assert.equal(
    getPartnerDecisionRemark({
      id: 'approved-2',
      status: 'APPROVED',
      action: 'SUPER_ADMIN_APPROVED',
      comment: '   ',
      createdAt: '2026-11-07T10:00:00.000Z',
    }),
    'Account approved and activated after successful compliance review. No additional remarks were added.',
  );
});

test('keeps correction and rejection remarks partner-visible without replacing them', () => {
  assert.equal(
    getPartnerDecisionRemark({
      id: 'changes-1',
      status: 'CHANGES_REQUESTED',
      action: 'SUPER_ADMIN_CHANGES_REQUESTED',
      comment: 'Please upload a clearer GST certificate.',
      createdAt: '2026-11-07T10:00:00.000Z',
    }),
    'Please upload a clearer GST certificate.',
  );
  assert.equal(
    getLatestPartnerDecision([
      {
        id: 'rejected-1',
        action: 'SUPER_ADMIN_REJECTED',
        comment: 'The submitted business details could not be verified.',
        createdAt: '2026-11-07T11:00:00.000Z',
      },
    ])?.status,
    'REJECTED',
  );
});
