import assert from 'node:assert/strict';
import test from 'node:test';
import {
  fitWorkingHours,
  followUpBucket,
  isMissed,
  isReminderDue,
  listingMatch,
  needsNextFollowUp,
  normalizeMobile,
  parseCsv,
  pickAssignee,
  ruleMatchesLead,
  scoreLead,
  slaDueAt,
  toCsv,
  type Requirement,
} from './rules';

// 2026-10-22 is a Thursday. IST = UTC+5:30.
const ist = (local: string) => new Date(`${local}+05:30`);

test('normalizeMobile accepts Indian mobiles in common formats', () => {
  assert.equal(normalizeMobile('+91 98765 43210'), '9876543210');
  assert.equal(normalizeMobile('919876543210'), '9876543210');
  assert.equal(normalizeMobile('09876543210'), '9876543210');
  assert.equal(normalizeMobile('98765-43210'), '9876543210');
  assert.equal(normalizeMobile('12345'), null);
  assert.equal(normalizeMobile('5876543210'), null);
  assert.equal(normalizeMobile(null), null);
});

test('followUpBucket uses IST calendar days', () => {
  const now = ist('2026-10-22T10:00:00');
  assert.equal(followUpBucket({ status: 'PENDING', dueAt: ist('2026-10-22T09:00:00') }, now), 'OVERDUE');
  assert.equal(followUpBucket({ status: 'PENDING', dueAt: ist('2026-10-22T23:30:00') }, now), 'TODAY');
  assert.equal(followUpBucket({ status: 'PENDING', dueAt: ist('2026-10-23T00:10:00') }, now), 'UPCOMING');
  assert.equal(followUpBucket({ status: 'DONE', dueAt: ist('2026-10-21T09:00:00') }, now), 'CLOSED');
});

test('reminders fire once, inside the lead window; missed after the grace period', () => {
  const now = ist('2026-10-22T10:00:00');
  const dueSoon = { status: 'PENDING', dueAt: ist('2026-10-22T10:10:00'), remindedAt: null };
  assert.equal(isReminderDue(dueSoon, now, 15), true);
  assert.equal(isReminderDue({ ...dueSoon, remindedAt: now }, now, 15), false);
  assert.equal(isReminderDue({ ...dueSoon, dueAt: ist('2026-10-22T11:00:00') }, now, 15), false);
  assert.equal(isMissed({ status: 'PENDING', dueAt: ist('2026-10-22T07:00:00') }, now, 120), true);
  assert.equal(isMissed({ status: 'PENDING', dueAt: ist('2026-10-22T08:30:00') }, now, 120), false);
  assert.equal(isMissed({ status: 'DONE', dueAt: ist('2026-10-21T07:00:00') }, now, 120), false);
});

test('fitWorkingHours moves times into the working window', () => {
  const hours = { start: '09:30', end: '19:00', days: [1, 2, 3, 4, 5, 6] };
  assert.deepEqual(fitWorkingHours(ist('2026-10-22T11:00:00'), hours), ist('2026-10-22T11:00:00'));
  assert.deepEqual(fitWorkingHours(ist('2026-10-22T07:00:00'), hours), ist('2026-10-22T09:30:00'));
  assert.deepEqual(fitWorkingHours(ist('2026-10-22T21:00:00'), hours), ist('2026-10-23T09:30:00'));
  // Saturday evening → Monday morning (Sunday closed).
  assert.deepEqual(fitWorkingHours(ist('2026-10-24T20:00:00'), hours), ist('2026-10-26T09:30:00'));
});

test('SLA and next-step rules', () => {
  const sla = { URGENT: 15, HIGH: 60, MEDIUM: 240, LOW: 1440 };
  const created = ist('2026-10-22T10:00:00');
  assert.deepEqual(slaDueAt(created, 'HIGH', sla), ist('2026-10-22T11:00:00'));
  assert.deepEqual(slaDueAt(created, 'nonsense', sla), ist('2026-10-22T14:00:00'));
  assert.equal(needsNextFollowUp('INTERESTED', true), true);
  assert.equal(needsNextFollowUp('WON', true), false);
  assert.equal(needsNextFollowUp('NEW', false), false);
});

test('scoreLead ranks engaged, prime, urgent leads hot and stale ones cold', () => {
  const base = { priority: 'MEDIUM', isPrime: false, repeatEnquiries: 0, listingViews30d: 0, contactClicks30d: 0, hasBudget: false, hasRequirement: false, source: 'WEBSITE', daysSinceLastActivity: 0, status: 'NEW' };
  assert.equal(scoreLead(base).temperature, 'COLD');
  const hot = scoreLead({ ...base, priority: 'URGENT', isPrime: true, repeatEnquiries: 2, hasBudget: true, status: 'NEGOTIATION' });
  assert.equal(hot.temperature, 'HOT');
  assert.ok(hot.score <= 100);
  assert.equal(scoreLead({ ...base, priority: 'HIGH', isPrime: true, daysSinceLastActivity: 40 }).temperature, 'COLD');
});

test('assignment rules: conditions and strategies', () => {
  const lead = { leadType: 'BUY', source: 'WEBSITE', priority: 'HIGH', categoryId: 'cat1', state: 'Chhattisgarh', city: 'Raipur' };
  assert.equal(ruleMatchesLead({ states: ['chhattisgarh'], leadTypes: ['BUY', 'SELL'] }, lead), true);
  assert.equal(ruleMatchesLead({ cities: ['Bilaspur'] }, lead), false);
  assert.equal(ruleMatchesLead(null, lead), true);

  const active = new Set(['a', 'b', 'c']);
  const rr = { strategy: 'ROUND_ROBIN', assigneeIds: ['a', 'x', 'b', 'c'], cursor: 0 };
  const first = pickAssignee(rr, active, new Map());
  assert.deepEqual(first, { userId: 'a', nextCursor: 1 });
  assert.deepEqual(pickAssignee({ ...rr, cursor: 3 }, active, new Map()), { userId: 'a', nextCursor: 1 });
  const least = pickAssignee({ strategy: 'LEAST_LOAD', assigneeIds: ['a', 'b', 'c'], cursor: 0 }, active, new Map([['a', 5], ['b', 1], ['c', 1]]));
  assert.equal(least?.userId, 'b');
  assert.equal(pickAssignee({ strategy: 'ROUND_ROBIN', assigneeIds: ['x'], cursor: 0 }, active, new Map()), null);
});

test('listingMatch applies hard filters then scores fit', () => {
  const req: Requirement = { categoryId: 'c', brandId: 'b', modelId: null, yearFrom: 2018, yearTo: null, budgetMin: null, budgetMax: 2000000, state: 'Chhattisgarh', city: 'Raipur' };
  const listing = { categoryId: 'c', brandId: 'b', modelId: 'm', manufacturingYear: 2020, price: 1800000, locationState: 'Chhattisgarh', locationCity: 'Raipur' };
  const score = listingMatch(req, listing);
  assert.ok(score !== null && score >= 80);
  assert.equal(listingMatch(req, { ...listing, manufacturingYear: 2016 }), null);
  assert.equal(listingMatch(req, { ...listing, price: 2300000 }), null);
  assert.ok((listingMatch(req, { ...listing, price: 2150000 }) ?? 0) < (score ?? 0));
  assert.equal(listingMatch(req, { ...listing, brandId: 'other' }), null);
});

test('CSV parse/serialise round-trip with quotes and formula guard', () => {
  const rows = parseCsv('﻿name,mobile,notes\r\n"Ram, Kumar",9876543210,"said ""call later"""\n\nSita,9123456789,\n');
  assert.deepEqual(rows, [['name', 'mobile', 'notes'], ['Ram, Kumar', '9876543210', 'said "call later"'], ['Sita', '9123456789', '']]);
  assert.equal(toCsv([['a', '=SUM(A1)', 'x,y', null]]), "a,'=SUM(A1),\"x,y\",");
});
