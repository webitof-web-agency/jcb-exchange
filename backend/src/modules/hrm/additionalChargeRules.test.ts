import assert from 'node:assert/strict';
import test from 'node:test';
import { chargeDateProblem, chargeEndChangeProblem, chargeState, periodsOverlap, planChargeEnd } from './additionalChargeRules';

const day = (value: string) => new Date(`${value}T00:00:00.000Z`);
const today = day('2026-11-25');
const charge = (from: string, to: string | null = null, status = 'ACTIVE') => ({ status, effectiveFrom: day(from), effectiveTo: to ? day(to) : null });

test('state follows the dates, the last day included; cancelled wins', () => {
  assert.equal(chargeState(charge('2026-11-26'), today), 'UPCOMING');
  assert.equal(chargeState(charge('2026-11-25'), today), 'ACTIVE');
  assert.equal(chargeState(charge('2026-11-01', '2026-11-25'), today), 'ACTIVE');
  assert.equal(chargeState(charge('2026-11-01', '2026-11-24'), today), 'ENDED');
  assert.equal(chargeState(charge('2026-11-01', null, 'CANCELLED'), today), 'CANCELLED');
});

test('inclusive periods overlap when they share a day; an open end runs for ever', () => {
  const a = { from: day('2026-11-01'), to: day('2026-11-10') };
  assert.equal(periodsOverlap(a, { from: day('2026-11-10'), to: null }), true);
  assert.equal(periodsOverlap(a, { from: day('2026-11-11'), to: null }), false);
  assert.equal(periodsOverlap({ from: day('2027-01-01'), to: null }, a), false);
  assert.equal(periodsOverlap({ from: day('2026-01-01'), to: null }, a), true);
});

test('new charge dates: not too far back or ahead, end not before the start or in the past', () => {
  assert.equal(chargeDateProblem({ from: today, to: null, today }), null);
  assert.equal(chargeDateProblem({ from: day('2026-09-01'), to: day('2026-12-31'), today }), null);
  assert.equal(chargeDateProblem({ from: day('2026-08-01'), to: null, today })?.path, 'effectiveFrom');
  assert.equal(chargeDateProblem({ from: day('2028-01-01'), to: null, today })?.path, 'effectiveFrom');
  assert.equal(chargeDateProblem({ from: day('2026-12-10'), to: day('2026-12-09'), today })?.path, 'effectiveTo');
  assert.equal(chargeDateProblem({ from: day('2026-11-01'), to: day('2026-11-24'), today })?.path, 'effectiveTo');
});

test('only a running or upcoming charge changes its last day', () => {
  assert.equal(chargeEndChangeProblem(charge('2026-11-01'), day('2026-12-31'), today), null);
  assert.equal(chargeEndChangeProblem(charge('2026-11-01', '2026-12-31'), null, today), null);
  assert.match(chargeEndChangeProblem(charge('2026-10-01', '2026-11-01'), null, today)!, /over/);
  assert.match(chargeEndChangeProblem(charge('2026-11-01'), day('2026-11-24'), today)!, /End charge/);
  assert.match(chargeEndChangeProblem(charge('2026-12-10'), day('2026-12-01'), today)!, /before the first day/);
});

test('ending never extends; ending before the start cancels and keeps the access off', () => {
  assert.deepEqual(planChargeEnd(charge('2026-11-01'), today), { kind: 'END', effectiveTo: today, scopeEnd: today });
  assert.deepEqual(planChargeEnd(charge('2026-11-01', '2026-11-20'), today), { kind: 'NONE' });
  assert.deepEqual(planChargeEnd(charge('2026-12-01'), today), { kind: 'CANCEL', scopeEnd: day('2026-11-30') });
  assert.deepEqual(planChargeEnd(charge('2026-11-01', null, 'CANCELLED'), today), { kind: 'NONE' });
});
