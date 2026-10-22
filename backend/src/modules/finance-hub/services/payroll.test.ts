import assert from 'node:assert/strict';
import test from 'node:test';
import { computePayslip, daysEmployed, gratuity, professionalTax } from './payrollRules';

const salary = [
  { code: 'BASIC', name: 'Basic', amount: 12000, pfWage: true },
  { code: 'HRA', name: 'HRA', amount: 4800, pfWage: false },
  { code: 'SPECIAL', name: 'Special', amount: 3200, pfWage: false },
];
const base = { month: '2026-10', earnings: salary, paidDays: 31, additions: 0, pfApplicable: true, pfWageCap: true, esiApplicable: true, ptState: '27', tds: 0, advanceDue: 0 };

test('full month: PF on basic, ESI within ₹21,000, Maharashtra PT', () => {
  const slip = computePayslip(base);
  assert.equal(slip.gross, 20000);
  assert.equal(slip.employeePf, 1440);
  assert.equal(slip.employerPf, 1440 + 60 + 60);
  assert.equal(slip.eps, 1000);
  assert.equal(slip.employeeEsi, 150);
  assert.equal(slip.employerEsi, 650);
  assert.equal(slip.professionalTax, 200);
  assert.equal(slip.net, 20000 - 1440 - 150 - 200);
});

test('loss of pay, PF wage ceiling, no ESI above ₹21,000, February PT', () => {
  const rich = [{ code: 'BASIC', name: 'Basic', amount: 40000, pfWage: true }, { code: 'HRA', name: 'HRA', amount: 20000, pfWage: false }];
  const slip = computePayslip({ ...base, month: '2027-02', earnings: rich, paidDays: 14 });
  assert.equal(slip.gross, 30000);
  assert.equal(slip.pfWage, 15000, 'capped');
  assert.equal(slip.employeePf, 1800);
  assert.equal(slip.employeeEsi, 0);
  assert.equal(slip.professionalTax, 300);
  const uncapped = computePayslip({ ...base, earnings: rich, pfWageCap: false });
  assert.equal(uncapped.employeePf, 4800);
});

test('advance recovery never makes net pay negative', () => {
  const slip = computePayslip({ ...base, tds: 1000, advanceDue: 50000 });
  assert.equal(slip.advanceRecovery, 20000 - 1440 - 150 - 200 - 1000);
  assert.equal(slip.net, 0);
});

test('PT slabs and employed days', () => {
  assert.equal(professionalTax('27', 9000, '2026-10'), 175);
  assert.equal(professionalTax('29', 24999, '2026-10'), 0);
  assert.equal(professionalTax('19', 30000, '2026-10'), 150);
  assert.equal(professionalTax('07', 90000, '2026-10'), 0);
  const day = (value: string) => new Date(`${value}T00:00:00.000Z`);
  assert.equal(daysEmployed('2026-10', day('2026-10-21'), null), 11);
  assert.equal(daysEmployed('2026-10', day('2026-01-01'), day('2026-10-10')), 10);
  assert.equal(daysEmployed('2026-10', day('2026-11-01'), null), 0);
});

test('gratuity after five years', () => {
  const day = (value: string) => new Date(`${value}T00:00:00.000Z`);
  assert.deepEqual(gratuity(26000, day('2021-01-01'), day('2025-12-31')), { years: 5, amount: 0 }, '4 years 11 months is not eligible');
  assert.deepEqual(gratuity(26000, day('2019-01-01'), day('2026-08-15')), { years: 8, amount: 120000 });
});
