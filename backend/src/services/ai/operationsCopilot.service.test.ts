import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildFinanceReview,
  buildFraudReview,
  buildKycReview,
  buildPartnerReview,
  buildRecruitmentReview,
  buildRtoReview,
} from './operationsCopilot.service';

test('KYC copilot identifies missing and expired evidence without exposing document values', () => {
  const result = buildKycReview([
    { type: 'PAN_CARD', status: 'APPROVED', expiryDate: null, hasFile: true, hasDocumentNumber: true },
    { type: 'GST_CERTIFICATE', status: 'EXPIRED', expiryDate: '2026-01-01', hasFile: true, hasDocumentNumber: true },
  ], ['PAN_CARD', 'GST_CERTIFICATE', 'AUTHORIZED_PERSON_ID'], new Date('2026-11-14T00:00:00Z'));

  assert.ok(result.blockers.some((item) => item.code === 'EXPIRED_DOCUMENT'));
  assert.ok(result.blockers.some((item) => item.code === 'MISSING_DOCUMENT'));
  assert.ok(result.recommendations.some((item) => /review|replace|upload/i.test(item)));
  assert.equal('documentNumber' in result, false);
});

test('RTO copilot explains compliance blockers and task priority', () => {
  const result = buildRtoReview({
    rtoStatus: 'IN_PROGRESS',
    taxStatus: 'EXPIRED',
    fitnessStatus: 'VALID',
    insuranceStatus: 'NOT_AVAILABLE',
    pucStatus: 'VALID',
    hsrpStatus: 'PENDING',
    pendingTasks: 3,
    optionalPendingTasks: 1,
  });

  assert.equal(result.priority, 'HIGH');
  assert.ok(result.blockers.some((item) => /tax/i.test(item.message)));
  assert.ok(result.blockers.some((item) => /insurance/i.test(item.message)));
  assert.ok(result.recommendations.some((item) => /customer|dealer|evidence/i.test(item)));
});

test('finance copilot flags negative cash movement and overdue collection work', () => {
  const result = buildFinanceReview({ periodDays: 30, inflow: 100_000, outflow: 180_000, net: -80_000, overdueCount: 4, overdueAmount: 250_000 });
  assert.equal(result.cashflowSignal, 'NEGATIVE');
  assert.equal(result.priority, 'HIGH');
  assert.ok(result.recommendations.some((item) => /collection/i.test(item)));
});

test('fraud copilot combines evidence into a review-only risk signal', () => {
  const result = buildFraudReview({
    price: 900_000,
    comparableMedian: 1_800_000,
    identityConflict: true,
    duplicateMediaCount: 2,
    paymentAnomaly: false,
    repeatedAccountSignals: 1,
  });
  assert.equal(result.riskLevel, 'HIGH');
  assert.ok(result.signals.length >= 3);
  assert.ok(result.recommendation.includes('human'));
});

test('partner and recruitment copilots return operational next steps', () => {
  const partner = buildPartnerReview({ publishedListings: 1, totalListings: 8, soldListings: 0, unansweredLeads: 5, averageResponseHours: 36 });
  assert.equal(partner.health, 'AT_RISK');
  assert.ok(partner.recommendations.length > 0);

  const recruitment = buildRecruitmentReview({ activeJobs: 2, newApplications: 20, underReview: 1, interviewsScheduled: 0, offersSent: 0, hiredCandidates: 0 });
  assert.ok(recruitment.recommendations.some((item) => /screen|interview/i.test(item)));
});
