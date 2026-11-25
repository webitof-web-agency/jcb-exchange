import assert from 'node:assert/strict';
import test from 'node:test';

import {
  describeCancelOutcome,
  describeJoining,
  describeResolveOutcome,
  describeUpcomingManagers,
  emptyShiftForm,
  formatMinutes,
  groupHolidaysByMonth,
  holidayScopeLabel,
  joiningTone,
  onboardingChipCounts,
  onboardingStatusLabel,
  reasonProblem,
  shiftFormFrom,
  shiftLengthMinutes,
  shiftPayloadFromForm,
  validateHolidayForm,
  validateShiftForm,
  rehireCandidates,
} from './hrmOnboardingPage';

const now = new Date('2026-11-27T10:00:00Z');

test('chip counts: open adds every unfinished status, all adds everything', () => {
  const counts = onboardingChipCounts({ NEEDS_REVIEW: 2, PENDING: 1, IN_PROGRESS: 5, READY_FOR_APPROVAL: 1, COMPLETED: 7, CANCELLED: 3 });
  assert.deepEqual(counts, { OPEN: 9, NEEDS_REVIEW: 2, IN_PROGRESS: 5, COMPLETED: 7, CANCELLED: 3, ALL: 19 });
  assert.equal(onboardingChipCounts({}).ALL, 0);
  assert.equal(onboardingStatusLabel('COMPLETED'), 'Joined');
  assert.equal(onboardingStatusLabel('SOMETHING_NEW'), 'something new');
});

test('joining date tone and text', () => {
  assert.equal(joiningTone('2026-11-20T00:00:00.000Z', 'IN_PROGRESS', now), 'overdue');
  assert.equal(joiningTone('2026-11-20T00:00:00.000Z', 'COMPLETED', now), 'later');
  assert.equal(joiningTone('2026-11-30T00:00:00.000Z', 'IN_PROGRESS', now), 'soon');
  assert.equal(joiningTone('2027-01-30T00:00:00.000Z', 'IN_PROGRESS', now), 'later');
  assert.equal(joiningTone(null, 'IN_PROGRESS', now), 'none');
  assert.match(describeJoining('2026-11-25T00:00:00.000Z', 'IN_PROGRESS', now), /2 days overdue/);
  assert.match(describeJoining('2026-11-27T00:00:00.000Z', 'PENDING', now), /today/);
  assert.match(describeJoining('2026-11-28T00:00:00.000Z', 'PENDING', now), /tomorrow/);
  assert.equal(describeJoining(null, 'PENDING', now), 'No joining date');
});

test('outcome and reason texts', () => {
  assert.match(describeCancelOutcome('ARCHIVED'), /archived/);
  assert.match(describeCancelOutcome('EXITED_AGAIN'), /Exited/);
  assert.match(describeResolveOutcome({ outcome: 'REHIRED', notes: ['Old login stays off.'] }), /re-opened.*Old login/);
  assert.equal(reasonProblem('  a '), 'Give a reason (at least 3 characters).');
  assert.equal(reasonProblem('No show'), null);
});

test('shift form checks mirror the server', () => {
  assert.deepEqual(validateShiftForm({ ...emptyShiftForm(), code: 'GEN', name: 'General' }), {});
  assert.match(validateShiftForm({ ...emptyShiftForm(), code: 'N', name: 'x' }).code ?? '', /2–30/);
  assert.match(validateShiftForm({ ...emptyShiftForm(), code: 'NIGHT', name: 'Night', startTime: '22:00', endTime: '06:00' }).endTime ?? '', /Night shift/);
  assert.deepEqual(validateShiftForm({ ...emptyShiftForm(), code: 'NIGHT', name: 'Night', startTime: '22:00', endTime: '06:00', isNightShift: true, halfDayMinutes: '200', fullDayMinutes: '420' }), {});
  assert.match(validateShiftForm({ ...emptyShiftForm(), code: 'S', name: 'x', startTime: '09:00', endTime: '10:00', breakMinutes: '60', halfDayMinutes: '', fullDayMinutes: '' }).breakMinutes ?? '', /break/);
  assert.match(validateShiftForm({ ...emptyShiftForm(), code: 'SS', name: 'x', halfDayMinutes: '500', fullDayMinutes: '480' }).halfDayMinutes ?? '', /less than/);
  assert.match(validateShiftForm({ ...emptyShiftForm(), code: 'SS', name: 'x', fullDayMinutes: '600' }).fullDayMinutes ?? '', /more than/);
  assert.match(validateShiftForm({ ...emptyShiftForm(), code: 'SS', name: 'x', startTime: '9:30' }).startTime ?? '', /HH:MM/);
  assert.equal(shiftLengthMinutes('09:30', '18:30', false), 540);
  assert.equal(shiftLengthMinutes('22:00', '06:00', true), 480);
  assert.equal(formatMinutes(90), '1h 30m');
  assert.equal(formatMinutes(45), '45m');
  assert.equal(formatMinutes(null), '—');
  const payload = shiftPayloadFromForm({ ...emptyShiftForm(), code: 'gen', name: ' General ', halfDayMinutes: '' });
  assert.deepEqual([payload.code, payload.name, payload.halfDayMinutes, payload.fullDayMinutes], ['GEN', 'General', null, 480]);
  assert.equal(shiftFormFrom(payload).halfDayMinutes, '');
});

test('holidays: grouping, labels and checks', () => {
  const groups = groupHolidaysByMonth([
    { id: '2', date: '2026-01-26T00:00:00.000Z', name: 'Republic Day', scope: 'ALL_INDIA', stateId: null, stateName: null, isOptional: false },
    { id: '1', date: '2026-01-14T00:00:00.000Z', name: 'Makar Sankranti', scope: 'STATE', stateId: 4, stateName: 'Gujarat', isOptional: true },
    { id: '3', date: '2026-08-15T00:00:00.000Z', name: 'Independence Day', scope: 'ALL_INDIA', stateId: null, stateName: null, isOptional: false },
  ]);
  assert.deepEqual(groups.map((group) => [group.key, group.holidays.map((holiday) => holiday.id)]), [['2026-01', ['1', '2']], ['2026-08', ['3']]]);
  assert.equal(holidayScopeLabel({ scope: 'STATE', stateName: 'Gujarat' }), 'Gujarat');
  assert.equal(holidayScopeLabel({ scope: 'ALL_INDIA', stateName: null }), 'All India');
  assert.deepEqual(Object.keys(validateHolidayForm({ date: '', name: '', scope: 'STATE', stateId: '', isOptional: false })).sort(), ['date', 'name', 'stateId']);
  assert.deepEqual(validateHolidayForm({ date: '2026-10-02', name: 'Gandhi Jayanti', scope: 'ALL_INDIA', stateId: '', isOptional: false }), {});
});

test('coverage text for a manager who is joining', () => {
  assert.equal(describeUpcomingManagers([]), null);
  assert.equal(describeUpcomingManagers([{ id: 'e', employeeCode: 'EMP-0009', name: 'Asha', joiningDate: '2026-12-01T00:00:00.000Z' }]), 'Manager joining: Asha (EMP-0009) on 1 Dec 2026');
});

test('joining labels follow the Indian calendar day, not UTC', () => {
  // 26 Nov 2026 01:00 IST = 25 Nov 2026 19:30 UTC: in India it is already the 26th.
  const earlyMorningIst = new Date('2026-11-25T19:30:00.000Z');
  assert.match(describeJoining('2026-11-26T00:00:00.000Z', 'PENDING', earlyMorningIst), /today/);
  assert.match(describeJoining('2026-11-25T00:00:00.000Z', 'PENDING', earlyMorningIst), /1 day overdue/);
  assert.equal(joiningTone('2026-11-25T00:00:00.000Z', 'IN_PROGRESS', earlyMorningIst), 'overdue');
});

test('only former employees among the matches can be re-hired', () => {
  const matches = [{ id: 'a', status: 'ACTIVE' }, { id: 'b', status: 'EXITED' }, { id: 'c', status: 'TERMINATED' }];
  assert.deepEqual(rehireCandidates(matches).map((match) => match.id), ['b', 'c']);
  assert.deepEqual(rehireCandidates([]), []);
});

test('the Onboarding page reads status, state and department from a link', async () => {
  const { readOnboardingLinkFilters } = await import('./hrmOnboardingPage');
  assert.deepEqual(readOnboardingLinkFilters('?status=NEEDS_REVIEW&stateId=27&orgUnitId=dept-1'), { chip: 'NEEDS_REVIEW', stateId: '27', orgUnitId: 'dept-1' });
  assert.deepEqual(readOnboardingLinkFilters('?status=PENDING'), { chip: 'OPEN', stateId: '', orgUnitId: '' }, 'other open statuses open the Open chip');
  assert.deepEqual(readOnboardingLinkFilters('?stateId=abc'), { chip: null, stateId: '', orgUnitId: '' });
  assert.deepEqual(readOnboardingLinkFilters(''), { chip: null, stateId: '', orgUnitId: '' });
});
