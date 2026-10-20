import assert from 'node:assert/strict';
import test from 'node:test';
import { evaluateRtoTransferCompliance } from './rtoCompliance';

const now = new Date('2026-10-20T10:00:00Z');
const validRecord = {
  hirePurchaseStatus: 'NOT_APPLICABLE',
  taxStatus: 'LIFETIME',
  insuranceStatus: 'VALID',
  insuranceValidUntil: '2027-06-01',
  pucStatus: 'VALID',
  pucValidUntil: '2027-01-15',
  fitnessStatus: 'VALID',
  fitnessValidUntil: '2028-01-01',
  hsrpStatus: 'YES',
};

test('allows transfer when every document is valid', () => {
  const result = evaluateRtoTransferCompliance(validRecord, null, { now });
  assert.equal(result.canTransfer, true);
  assert.equal(result.blockers.length, 0);
  assert.equal(result.source, 'RECORD');
});

test('blocks transfer with a reason when insurance has expired', () => {
  const result = evaluateRtoTransferCompliance({ ...validRecord, insuranceValidUntil: '2026-09-30' }, null, { now });
  assert.equal(result.canTransfer, false);
  const [blocker] = result.blockers;
  assert.ok(blocker);
  assert.equal(blocker.key, 'INSURANCE');
  assert.match(blocker.message, /expired on 30\/09\/2026/);
  assert.ok(blocker.action);
  assert.deepEqual(result.expiredDocuments, ['INSURANCE']);
});

test('only warns for an expired optional fitness certificate', () => {
  const result = evaluateRtoTransferCompliance({ ...validRecord, fitnessStatus: 'EXPIRED' }, null, { now });
  assert.equal(result.canTransfer, true);
  assert.equal(result.warnings.some((check) => check.key === 'FITNESS'), true);
});

test('uses RC API data for hypothecation, blacklist and dates', () => {
  const result = evaluateRtoTransferCompliance(validRecord, {
    rcStatus: 'ACTIVE',
    financer: 'HDFC BANK',
    blacklistStatus: 'NA',
    taxUpto: '2026-08-01',
    insuranceUpto: '2027-05-01',
  }, { now });
  assert.equal(result.canTransfer, false);
  assert.deepEqual(result.blockers.map((check) => check.key).sort(), ['HYPOTHECATION', 'TAX']);
  assert.equal(result.suggested.financerName, 'HDFC BANK');
  assert.equal(result.suggested.insuranceValidUntil, '2027-05-01');
  assert.equal(result.suggested.taxStatus, 'EXPIRED');
});

test('warns about inter-state transfers', () => {
  const result = evaluateRtoTransferCompliance(validRecord, null, { now, sellerState: 'Chhattisgarh', purchaserState: 'Odisha' });
  assert.equal(result.warnings.some((check) => check.key === 'INTER_STATE'), true);
});
