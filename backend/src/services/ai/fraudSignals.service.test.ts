import assert from 'node:assert/strict';
import test from 'node:test';
import { buildFraudSignalSummary } from './fraudSignals.service';

test('uses a real median and explainable duplicate/account signals', () => {
  const result = buildFraudSignalSummary({
    prices: [100, 300, 200, 0, 'invalid'],
    identityConflictCount: 1,
    mediaUrls: ['https://cdn/a.jpg', 'https://cdn/a.jpg', 'https://cdn/b.jpg', null],
    rejectedPaymentCount: 2,
    listingPartnerIds: ['partner-a', 'partner-a', 'partner-a', 'partner-b'],
  });

  assert.equal(result.comparableMedian, 200);
  assert.equal(result.listingsReviewed, 3);
  assert.equal(result.duplicateMediaGroups, 1);
  assert.equal(result.duplicateMedia, 1);
  assert.equal(result.repeatedAccountSignals, 1);
  assert.equal(result.review.riskLevel, 'HIGH');
});

test('does not invent risk when the source set is empty or malformed', () => {
  const result = buildFraudSignalSummary({
    prices: [null, undefined, 'not-a-number'],
    identityConflictCount: -4,
    mediaUrls: [null, '', '   '],
    rejectedPaymentCount: -1,
    listingPartnerIds: [null, undefined],
  });

  assert.deepEqual(result, {
    comparableMedian: null,
    listingsReviewed: 0,
    identityConflicts: 0,
    rejectedPayments: 0,
    duplicateMedia: 0,
    duplicateMediaGroups: 0,
    repeatedAccountSignals: 0,
    review: {
      riskLevel: 'LOW',
      signals: [],
      recommendation: 'No strong anomaly signal was found by the configured checks; continue normal moderation.',
    },
  });
});
