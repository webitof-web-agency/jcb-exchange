import assert from 'node:assert/strict';
import test from 'node:test';

import type { HrmReportSummary } from './hrmApi';
import {
  barPercent, buildReportTiles, departmentRows, describeTruncation, headcountCsvFileName, headcountTotals, indiaDay, indiaMonth,
  isValidMonth, monthLabel, openOnboardingCount, shiftMonth, sortHeadcount, stateRows,
} from './hrmReports';

const report: HrmReportSummary = {
  month: '2026-11',
  filters: { stateId: null, orgUnitId: null },
  totals: { working: 40, notice: 2, joining: 5, onHold: 1 },
  unplaced: 0,
  byState: [
    { stateId: 27, state: 'Maharashtra', working: 10, notice: 1, joining: 2, onHold: 0, total: 13 },
    { stateId: 22, state: 'Chhattisgarh', working: 30, notice: 1, joining: 3, onHold: 1, total: 35 },
    { stateId: null, state: 'No state', working: 0, notice: 0, joining: 0, onHold: 0, total: 0 },
  ],
  byDepartment: [{ orgUnitId: 'd1', department: 'Sales', working: 40, notice: 2, joining: 5, onHold: 1, total: 48 }],
  joinings: { count: 3, truncated: false, people: [] },
  exits: { count: 1, truncated: false, people: [] },
  onboarding: { NEEDS_REVIEW: 1, IN_PROGRESS: 4, COMPLETED: 9, CANCELLED: 2 },
  kyc: { employees: 42, complete: 30, percent: 71 },
  vacantStates: [{ officeId: 'o1', office: 'Goa State Office', state: 'Goa' }],
  scope: { allIndia: true },
};

test('tiles: open onboarding, KYC tone, unplaced only when there are some', () => {
  assert.equal(openOnboardingCount(report.onboarding), 5);
  const tiles = buildReportTiles(report);
  assert.deepEqual(tiles.map((tile) => tile.key), ['working', 'notice', 'joining', 'onHold', 'kyc', 'vacant', 'onboarding']);
  assert.equal(tiles.find((tile) => tile.key === 'kyc')?.tone, 'amber');
  assert.equal(tiles.find((tile) => tile.key === 'vacant')?.value, '1');
  assert.ok(buildReportTiles({ ...report, unplaced: 3 }).some((tile) => tile.key === 'unplaced'));
});

test('headcount tables sort and total', () => {
  const rows = stateRows(report);
  assert.deepEqual(sortHeadcount(rows, 'total').map((row) => row.name), ['Chhattisgarh', 'Maharashtra', 'No state']);
  assert.deepEqual(sortHeadcount(rows, 'name').map((row) => row.name), ['Chhattisgarh', 'Maharashtra', 'No state']);
  assert.deepEqual(headcountTotals(rows), { working: 40, notice: 2, joining: 5, onHold: 1, total: 48 });
  assert.equal(departmentRows(report)[0]!.key, 'd1');
  assert.equal(barPercent(35, 35), 100);
  assert.equal(barPercent(1, 1000), 2, 'tiny values stay visible');
  assert.equal(barPercent(0, 35), 0);
});

test('months follow the Indian calendar', () => {
  // 2026-11-30 20:00 UTC is already 1 December in India.
  const late = new Date('2026-11-30T20:00:00.000Z');
  assert.equal(indiaMonth(late), '2026-12');
  assert.equal(indiaDay(late), '2026-12-01');
  assert.equal(shiftMonth('2026-01', -1), '2025-12');
  assert.equal(shiftMonth('2026-12', 1), '2027-01');
  assert.equal(isValidMonth('2026-13'), false);
  assert.equal(monthLabel('2026-11'), 'November 2026');
  assert.equal(headcountCsvFileName('state', late), 'hrm-headcount-state-2026-12-01.csv');
  assert.equal(describeTruncation(200, 312), 'Showing the first 200 of 312.');
  assert.equal(describeTruncation(3, 3), null);
});

test('next month never goes past the current month in India, also when the input is empty', async () => {
  const { nextReportMonth } = await import('./hrmReports');
  const now = new Date('2026-11-28T10:00:00Z');
  assert.deepEqual(nextReportMonth('2026-10', now), { canGoNext: true, next: '2026-11' });
  assert.deepEqual(nextReportMonth('2026-11', now), { canGoNext: false, next: '2026-11' });
  assert.deepEqual(nextReportMonth('', now), { canGoNext: false, next: '2026-11' });
  assert.deepEqual(nextReportMonth('garbage', now), { canGoNext: false, next: '2026-11' });
});

test('a failed CSV download shows the server message from the Blob body', async () => {
  const { readBlobErrorMessage } = await import('./hrmReports');
  const blobError = { response: { data: new Blob([JSON.stringify({ success: false, error: 'You do not have the required HRM permission.' })], { type: 'application/json' }) } };
  assert.equal(await readBlobErrorMessage(blobError, 'fallback'), 'You do not have the required HRM permission.');
  assert.equal(await readBlobErrorMessage({ response: { data: new Blob(['not json']) } }, 'fallback'), 'fallback');
  assert.equal(await readBlobErrorMessage(new Error('network'), 'fallback'), 'fallback');
});

test('onboarding pipeline links keep the state and department filters', async () => {
  const { onboardingStatusHref } = await import('./hrmReports');
  assert.equal(onboardingStatusHref('/admin/hrm', 'NEEDS_REVIEW', {}), '/admin/hrm/onboarding?status=NEEDS_REVIEW');
  assert.equal(onboardingStatusHref('/admin/hrm', 'IN_PROGRESS', { stateId: '27', orgUnitId: 'dept-1' }), '/admin/hrm/onboarding?status=IN_PROGRESS&stateId=27&orgUnitId=dept-1');
});
