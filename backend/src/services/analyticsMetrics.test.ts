import test from 'node:test';
import assert from 'node:assert/strict';
import {
  calculateConversionRate,
  calculateDemandPerStock,
  calculateDemandScore,
  calculatePercentageChange,
  getPreviousPeriod,
} from './analyticsMetrics';

test('builds an equal-length previous period without overlapping the selected period', () => {
  const current = getPreviousPeriod(
    new Date('2026-09-10T00:00:00.000Z'),
    new Date('2026-09-19T23:59:59.999Z'),
  );

  assert.deepEqual(current, {
    from: new Date('2026-08-31T00:00:00.000Z'),
    to: new Date('2026-09-09T23:59:59.999Z'),
  });
});

test('returns null percentage change when the previous value is zero', () => {
  assert.equal(calculatePercentageChange(10, 0), null);
  assert.equal(calculatePercentageChange(12, 10), 20);
  assert.equal(calculatePercentageChange(8, 10), -20);
});

test('returns zero conversion for an empty lead cohort', () => {
  assert.equal(calculateConversionRate(0, 0), 0);
  assert.equal(calculateConversionRate(2, 8), 25);
});

test('uses the documented transparent demand weights', () => {
  assert.equal(calculateDemandScore({ views: 4, leads: 2, wonLeads: 1 }), 24);
});

test('separates demand per stock from the raw demand score', () => {
  assert.equal(calculateDemandPerStock(43, 2), 21.5);
  assert.equal(calculateDemandPerStock(43, 0), null);
});
