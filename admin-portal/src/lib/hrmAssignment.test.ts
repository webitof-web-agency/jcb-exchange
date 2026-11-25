import assert from 'node:assert/strict';
import test from 'node:test';

import {
  createEmptyAssignmentForm,
  describeReactivation,
  effectiveOfficeKind,
  firstAssignmentError,
  isRealDay,
  maxStartDate,
  placeAfterSwitch,
  stateOfficeStatus,
  toAssignmentPayload,
  toLocalDay,
  validateAssignmentForm,
  validateStartDate,
  type AssignmentContext,
  type AssignmentForm,
} from './hrmAssignment';

const place = { stateId: 4040, cityId: 133590 };
const states = [
  { id: 4040, name: 'Chhattisgarh', hasOffice: true, officeSwitchedOff: false },
  { id: 4041, name: 'Gujarat', hasOffice: true, officeSwitchedOff: false },
  { id: 4042, name: 'Rajasthan', hasOffice: false, officeSwitchedOff: false },
  { id: 4043, name: 'Kerala', hasOffice: false, officeSwitchedOff: true },
];
const now = new Date('2026-11-25T10:00:00.000Z');
const context: AssignmentContext = { headOfficeAvailable: true, headOfficePlace: place, states, canManageOrg: true, now };

const filled: AssignmentForm = {
  ...createEmptyAssignmentForm('2026-11-25', place),
  orgUnitId: 'dept-1', designation: ' Executive ', reason: '  joined from offer  ',
};

test('local day is the calendar day a date input shows', () => {
  assert.equal(toLocalDay(new Date(2026, 10, 4)), '2026-11-04');
});

test('dates must exist, not be older than 1990 and not be more than a year ahead (UTC)', () => {
  assert.equal(isRealDay('2026-02-31'), false);
  assert.equal(isRealDay('2026-02-28'), true);
  assert.equal(isRealDay('26-02-28'), false);
  assert.equal(maxStartDate(now), '2027-11-25');
  assert.equal(validateStartDate('', now), 'Select the start date.');
  assert.match(validateStartDate('2026-02-31', now), /valid/);
  assert.match(validateStartDate('1989-12-31', now), /valid/);
  assert.equal(validateStartDate('1990-01-01', now), '');
  assert.equal(validateStartDate('2027-11-25', now), '');
  assert.match(validateStartDate('2027-11-26', now), /one year/);
  // 01:30 IST on 26 Nov (20:00 UTC on 25 Nov): the server's day is already 26 Nov.
  assert.equal(maxStartDate(new Date('2026-11-25T20:00:00.000Z')), '2027-11-26');
});

test('the form starts at the head office place when there is one, otherwise at a state office', () => {
  const withPlace = createEmptyAssignmentForm('2026-11-25', place);
  assert.deepEqual([withPlace.locationType, withPlace.stateId, withPlace.cityId, withPlace.effectiveFrom, withPlace.employmentType], ['HEAD_OFFICE', '4040', '133590', '2026-11-25', 'FULL_TIME']);
  const without = createEmptyAssignmentForm('2026-11-25', null);
  assert.deepEqual([without.locationType, without.stateId, without.cityId], ['STATE_OFFICE', '', '']);
});

test('switching the location keeps what was typed but drops the head office default', () => {
  assert.deepEqual(placeAfterSwitch(filled, 'STATE_OFFICE', place), { stateId: '', cityId: '' });
  const typed = { ...filled, locationType: 'STATE_OFFICE' as const, stateId: '4041', cityId: '9' };
  assert.deepEqual(placeAfterSwitch(typed, 'HEAD_OFFICE', place), { stateId: '4040', cityId: '133590' });
  assert.deepEqual(placeAfterSwitch({ ...filled, stateId: '4041', cityId: '9' }, 'STATE_OFFICE', place), { stateId: '4041', cityId: '9' });
  assert.deepEqual(placeAfterSwitch(typed, 'STATE_OFFICE', place), { stateId: '4041', cityId: '9' });
});

test('a head office assignment somewhere else is really a state office one', () => {
  assert.equal(effectiveOfficeKind(filled, place), 'HEAD_OFFICE');
  assert.equal(effectiveOfficeKind({ ...filled, cityId: '5' }, place), 'STATE_OFFICE');
  assert.equal(effectiveOfficeKind({ ...filled, locationType: 'STATE_OFFICE' }, place), 'STATE_OFFICE');
  assert.equal(effectiveOfficeKind(filled, null), 'STATE_OFFICE');
});

test('state office status: ready, created for an administrator, blocked otherwise', () => {
  assert.equal(stateOfficeStatus(states[1], false).kind, 'ok');
  assert.equal(stateOfficeStatus(undefined, false).kind, 'ok');
  const create = stateOfficeStatus(states[2], true);
  assert.equal(create.kind, 'create');
  assert.match(create.message, /state office will be created for Rajasthan/);
  const blocked = stateOfficeStatus(states[2], false);
  assert.equal(blocked.kind, 'blocked');
  assert.match(blocked.message, /Rajasthan has no state office yet\. Ask an administrator/);
  const off = stateOfficeStatus(states[3], true);
  assert.equal(off.kind, 'blocked');
  assert.match(off.message, /Kerala state office is switched off\. Switch it on from the Organisation page first\./);
});

test('a complete head office form is valid', () => {
  assert.deepEqual(validateAssignmentForm(filled, context), {});
});

test('missing fields are reported in the order the form shows them', () => {
  const errors = validateAssignmentForm({ ...createEmptyAssignmentForm('', null), locationType: 'STATE_OFFICE' }, { ...context, headOfficePlace: null });
  assert.deepEqual(Object.keys(errors).sort(), ['cityId', 'designation', 'effectiveFrom', 'orgUnitId', 'stateId']);
  assert.equal(firstAssignmentError(errors), 'stateId');
  assert.equal(firstAssignmentError({}), undefined);
});

test('head office needs to be set up', () => {
  const errors = validateAssignmentForm(filled, { ...context, headOfficeAvailable: false });
  assert.ok(errors.locationType);
});

test('state and city are both needed, for the head office too', () => {
  assert.ok(validateAssignmentForm({ ...filled, cityId: '' }, context).cityId);
  assert.ok(validateAssignmentForm({ ...filled, stateId: '', cityId: '' }, context).stateId);
});

test('a state without a usable office blocks the save, but only for state office placements', () => {
  const rajasthan = { ...filled, locationType: 'STATE_OFFICE' as const, stateId: '4042', cityId: '77' };
  assert.equal(validateAssignmentForm(rajasthan, context).stateId, undefined);
  assert.match(validateAssignmentForm(rajasthan, { ...context, canManageOrg: false }).stateId ?? '', /no state office yet/);
  const kerala = { ...rajasthan, stateId: '4043' };
  assert.match(validateAssignmentForm(kerala, context).stateId ?? '', /switched off/);
  // Head office city: the head office is used, the state's office status does not matter.
  assert.equal(validateAssignmentForm(filled, { ...context, states: [{ ...states[0]!, hasOffice: false }] }).stateId, undefined);
  // A "head office" form moved to another place is judged as that state's office.
  assert.match(validateAssignmentForm({ ...filled, stateId: '4043', cityId: '8' }, context).stateId ?? '', /switched off/);
});

test('employment type, date and reason limits', () => {
  assert.ok(validateAssignmentForm({ ...filled, employmentType: 'SEASONAL' }, context).employmentType);
  assert.equal(validateAssignmentForm({ ...filled, employmentType: '' }, context).employmentType, undefined);
  assert.ok(validateAssignmentForm({ ...filled, effectiveFrom: '2030-01-01' }, context).effectiveFrom);
  assert.ok(validateAssignmentForm({ ...filled, reason: 'x'.repeat(501) }, context).reason);
});

test('the payload is trimmed, numeric ids are numbers and nothing else is sent', () => {
  assert.deepEqual(toAssignmentPayload(filled), {
    orgUnitId: 'dept-1', designation: 'Executive', employmentType: 'FULL_TIME', stateId: 4040, cityId: 133590, effectiveFrom: '2026-11-25', reason: 'joined from offer',
  });
  const noReason = toAssignmentPayload({ ...filled, reason: '   ', employmentType: '' });
  assert.equal('reason' in noReason, false);
  assert.equal(noReason.employmentType, 'FULL_TIME');
  for (const key of ['managerEmployeeId', 'approvalManagerId', 'workMode', 'operationalRegionId', 'status', 'effectiveTo']) assert.equal(key in toAssignmentPayload(filled), false);
});

test('the reactivation notice only claims a login when one was re-enabled', () => {
  assert.equal(describeReactivation({ employeeCode: 'EMP-0007', loginEnabled: true }), 'EMP-0007 is active again and their login is enabled.');
  assert.equal(describeReactivation({ employeeCode: 'EMP-0007', loginEnabled: false }), 'EMP-0007 is active again.');
});
