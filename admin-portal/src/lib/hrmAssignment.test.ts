import assert from 'node:assert/strict';
import test from 'node:test';

import {
  createEmptyAssignmentForm,
  describeReactivation,
  firstAssignmentError,
  isRealDay,
  maxStartDate,
  stateOfficeStatus,
  toAssignmentPayload,
  toLocalDay,
  validateAssignmentForm,
  validateStartDate,
  type AssignmentContext,
  type AssignmentForm,
} from './hrmAssignment';

const states = [
  { id: 4040, name: 'Chhattisgarh', hasOffice: true, officeSwitchedOff: false },
  { id: 4041, name: 'Gujarat', hasOffice: true, officeSwitchedOff: false },
  { id: 4042, name: 'Rajasthan', hasOffice: false, officeSwitchedOff: false },
  { id: 4043, name: 'Kerala', hasOffice: false, officeSwitchedOff: true },
];
const now = new Date('2026-11-25T10:00:00.000Z');
const context: AssignmentContext = { headOfficeAvailable: true, states, canManageOrg: true, now };

const filled: AssignmentForm = {
  ...createEmptyAssignmentForm('2026-11-25', 'ho-1'),
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

test('the form starts on the default head office when there is one, otherwise at a state office', () => {
  const withOffice = createEmptyAssignmentForm('2026-11-25', 'ho-1');
  assert.deepEqual([withOffice.locationType, withOffice.headOfficeUnitId, withOffice.stateId, withOffice.effectiveFrom, withOffice.employmentType], ['HEAD_OFFICE', 'ho-1', '', '2026-11-25', 'FULL_TIME']);
  const without = createEmptyAssignmentForm('2026-11-25', null);
  assert.deepEqual([without.locationType, without.headOfficeUnitId, without.stateId, without.cityId], ['STATE_OFFICE', '', '', '']);
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
  const errors = validateAssignmentForm({ ...createEmptyAssignmentForm('', null), locationType: 'STATE_OFFICE' }, context);
  assert.deepEqual(Object.keys(errors).sort(), ['cityId', 'designation', 'effectiveFrom', 'orgUnitId', 'stateId']);
  assert.equal(firstAssignmentError(errors), 'stateId');
  assert.equal(firstAssignmentError({}), undefined);
});

test('head office needs to be set up', () => {
  const errors = validateAssignmentForm(filled, { ...context, headOfficeAvailable: false });
  assert.ok(errors.locationType);
});

test('a head office needs no state or city, but the chosen office must be usable', () => {
  assert.deepEqual(validateAssignmentForm({ ...filled, stateId: '', cityId: '' }, context), {});
  assert.equal(validateAssignmentForm(filled, { ...context, headOfficeMessage: 'It has no state and city.' }).headOfficeUnitId, 'It has no state and city.');
});

const stateForm = { ...filled, locationType: 'STATE_OFFICE' as const };

test('a state office needs state and city', () => {
  assert.ok(validateAssignmentForm({ ...stateForm, stateId: '4041', cityId: '' }, context).cityId);
  assert.ok(validateAssignmentForm({ ...stateForm, stateId: '', cityId: '' }, context).stateId);
});

test('a state without a usable office blocks the save, but only for state office placements', () => {
  const rajasthan = { ...stateForm, stateId: '4042', cityId: '77' };
  assert.equal(validateAssignmentForm(rajasthan, context).stateId, undefined);
  assert.match(validateAssignmentForm(rajasthan, { ...context, canManageOrg: false }).stateId ?? '', /no state office yet/);
  assert.match(validateAssignmentForm({ ...rajasthan, stateId: '4043' }, context).stateId ?? '', /switched off/);
  // A head office posting never looks at a state office, whatever state was picked before switching.
  assert.equal(validateAssignmentForm({ ...filled, stateId: '4043', cityId: '8' }, context).stateId, undefined);
});

test('employment type, date and reason limits', () => {
  assert.ok(validateAssignmentForm({ ...filled, employmentType: 'SEASONAL' }, context).employmentType);
  assert.equal(validateAssignmentForm({ ...filled, employmentType: '' }, context).employmentType, undefined);
  assert.ok(validateAssignmentForm({ ...filled, effectiveFrom: '2030-01-01' }, context).effectiveFrom);
  assert.ok(validateAssignmentForm({ ...filled, reason: 'x'.repeat(501) }, context).reason);
});

test('the payload is trimmed; a head office is named, a state office sends its state and city', () => {
  assert.deepEqual(toAssignmentPayload(filled), {
    orgUnitId: 'dept-1', designation: 'Executive', employmentType: 'FULL_TIME', locationType: 'HEAD_OFFICE', headOfficeUnitId: 'ho-1', effectiveFrom: '2026-11-25', reason: 'joined from offer',
  });
  const state = toAssignmentPayload({ ...stateForm, stateId: '4040', cityId: '133590' });
  assert.deepEqual([state.locationType, state.stateId, state.cityId, 'headOfficeUnitId' in state], ['STATE_OFFICE', 4040, 133590, false]);
  const noReason = toAssignmentPayload({ ...filled, reason: '   ', employmentType: '' });
  assert.equal('reason' in noReason, false);
  assert.equal(noReason.employmentType, 'FULL_TIME');
  for (const key of ['managerEmployeeId', 'approvalManagerId', 'workMode', 'operationalRegionId', 'status', 'effectiveTo']) assert.equal(key in toAssignmentPayload(filled), false);
});

test('the reactivation notice only claims a login when one was re-enabled', () => {
  assert.equal(describeReactivation({ employeeCode: 'EMP-0007', loginEnabled: true }), 'EMP-0007 is active again and their login is enabled.');
  assert.equal(describeReactivation({ employeeCode: 'EMP-0007', loginEnabled: false }), 'EMP-0007 is active again.');
});
