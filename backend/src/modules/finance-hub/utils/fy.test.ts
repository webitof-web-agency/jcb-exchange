import assert from 'node:assert/strict';
import test from 'node:test';
import {
  financialQuarterOf,
  financialYearLabel,
  financialYearMonths,
  financialYearOf,
  gstReturnPeriod,
  istToday,
} from './fy';

const day = (value: string) => new Date(`${value}T00:00:00.000Z`);

test('financialYearOf splits the Indian FY on 1 April', () => {
  assert.equal(financialYearOf(day('2026-03-31')).label, 'FY 2025-26');
  const fy = financialYearOf(day('2026-04-01'));
  assert.equal(fy.label, 'FY 2026-27');
  assert.equal(fy.startDate.toISOString(), '2026-04-01T00:00:00.000Z');
  assert.equal(fy.endDate.toISOString(), '2027-03-31T00:00:00.000Z');
});

test('financialYearLabel pads the closing year across a century boundary', () => {
  assert.equal(financialYearLabel(2099), 'FY 2099-00');
  assert.equal(financialYearLabel(2008), 'FY 2008-09');
});

test('financialQuarterOf follows April-June as Q1', () => {
  assert.equal(financialQuarterOf(day('2026-04-15')), 'Q1');
  assert.equal(financialQuarterOf(day('2026-09-30')), 'Q2');
  assert.equal(financialQuarterOf(day('2026-10-01')), 'Q3');
  assert.equal(financialQuarterOf(day('2027-01-01')), 'Q4');
  assert.equal(financialQuarterOf(day('2027-03-31')), 'Q4');
});

test('gstReturnPeriod is MMYYYY', () => {
  assert.equal(gstReturnPeriod(day('2026-10-21')), '102026');
  assert.equal(gstReturnPeriod(day('2027-01-05')), '012027');
});

test('istToday rolls over at Indian midnight, not UTC midnight', () => {
  assert.equal(istToday(new Date('2026-10-21T18:29:00.000Z')).toISOString().slice(0, 10), '2026-10-21');
  assert.equal(istToday(new Date('2026-10-21T18:31:00.000Z')).toISOString().slice(0, 10), '2026-10-22');
});

test('financialYearMonths returns April to March with correct month ends', () => {
  const months = financialYearMonths(2027);
  assert.equal(months.length, 12);
  assert.equal(months[0]?.label, 'Apr 2027');
  assert.equal(months[11]?.label, 'Mar 2028');
  assert.equal(months[10]?.endDate.toISOString().slice(0, 10), '2028-02-29');
  assert.equal(months[8]?.endDate.toISOString().slice(0, 10), '2027-12-31');
});
