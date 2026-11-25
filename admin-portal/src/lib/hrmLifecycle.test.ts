import assert from 'node:assert/strict';
import test from 'node:test';

import type { HrmOrganisationUnit } from './hrmApi';
import {
  DESIGNATION_REQUIRED_CODE,
  KEEP_MANAGER,
  REPLACE_DATE_MESSAGE,
  createAppointForm,
  createDeactivateForm,
  createReplaceForm,
  createTransferForm,
  dayDifference,
  describeDeactivation,
  describeMoveResult,
  describeNationalManagers,
  describeOfficeOption,
  describeReplaceResult,
  effectiveDateBounds,
  errorCodeOf,
  isRealDay,
  managerPayloadValue,
  officeCoverageLabel,
  outgoingActionOptions,
  selectableOffices,
  setManager,
  shiftDay,
  stopsBeingManager,
  toAppointPayload,
  toDeactivatePayload,
  toLocalDay,
  toReplacePayload,
  toServerDay,
  toTransferPayload,
  toUtcDay,
  validateAppointForm,
  validateDeactivateForm,
  validateEffectiveDate,
  validateManagerChoice,
  validateReplaceForm,
  validateTransferForm,
} from './hrmLifecycle';

const TODAY = '2026-11-25';

const unit = (overrides: Partial<HrmOrganisationUnit>): HrmOrganisationUnit => ({
  id: 'u', code: 'C', name: 'Unit', type: 'REGION', kind: 'STATE', isActive: true, parent: null, state: null, city: null,
  managers: [], childCount: 0, employeeCount: 0, coverage: null, ...overrides,
});

test('calendar helpers: real days, shifting and differences', () => {
  assert.equal(isRealDay('2026-02-28'), true);
  assert.equal(isRealDay('2026-02-31'), false);
  assert.equal(isRealDay('26-02-01'), false);
  assert.equal(shiftDay('2026-03-01', -1), '2026-02-28');
  assert.equal(shiftDay('2026-12-31', 1), '2027-01-01');
  assert.equal(dayDifference('2026-11-25', '2026-11-28'), 3);
  assert.equal(dayDifference('2026-11-25', '2026-11-20'), -5);
  assert.equal(toLocalDay(new Date(2026, 10, 4)), '2026-11-04');
  assert.equal(toUtcDay(new Date(Date.UTC(2026, 10, 4, 23, 59))), '2026-11-04');
});

test('effective date: 90 days back, a year ahead, never in the future for a deactivation', () => {
  assert.equal(validateEffectiveDate(TODAY, TODAY, { allowFuture: true }), '');
  assert.equal(validateEffectiveDate(shiftDay(TODAY, -90), TODAY, { allowFuture: true }), '');
  assert.match(validateEffectiveDate(shiftDay(TODAY, -91), TODAY, { allowFuture: true }), /90 days in the past/);
  assert.equal(validateEffectiveDate(shiftDay(TODAY, 365), TODAY, { allowFuture: true }), '');
  assert.match(validateEffectiveDate(shiftDay(TODAY, 366), TODAY, { allowFuture: true }), /a year ahead/);
  assert.match(validateEffectiveDate(shiftDay(TODAY, 1), TODAY, { allowFuture: false }), /future/);
  assert.equal(validateEffectiveDate(TODAY, TODAY, { allowFuture: false }), '');
  assert.match(validateEffectiveDate('', TODAY, { allowFuture: true }), /Select the date/);
  assert.match(validateEffectiveDate('2026-02-31', TODAY, { allowFuture: true }), /valid date/);
  assert.deepEqual(effectiveDateBounds(TODAY, false), { min: '2026-08-27', max: TODAY });
  assert.deepEqual(effectiveDateBounds(TODAY, true), { min: '2026-08-27', max: '2027-11-25' });
});

test('reporting manager choice: keep omits, none clears, set names the person and never the employee themselves', () => {
  assert.equal(managerPayloadValue(KEEP_MANAGER), undefined);
  assert.equal(managerPayloadValue({ mode: 'none', employeeId: '' }), null);
  assert.equal(managerPayloadValue(setManager('m1')), 'm1');
  assert.equal(validateManagerChoice(KEEP_MANAGER), '');
  assert.match(validateManagerChoice({ mode: 'set', employeeId: '' }), /Choose the reporting manager/);
  assert.match(validateManagerChoice(setManager('e1'), 'e1'), /themselves/);
  assert.equal(validateManagerChoice(setManager('m1'), 'e1'), '');
});

test('offices: active only, head office first, current office left out', () => {
  const offices = selectableOffices([
    unit({ id: 's2', name: 'Maharashtra State Office', state: { id: 2, name: 'Maharashtra' } }),
    unit({ id: 'h', name: 'Raipur Head Office', kind: 'HEAD_OFFICE', type: 'HEAD_OFFICE' }),
    unit({ id: 's1', name: 'Gujarat State Office', state: { id: 1, name: 'Gujarat' } }),
    unit({ id: 's3', name: 'Goa State Office', isActive: false }),
    unit({ id: 'd', name: 'Finance', kind: 'DEPARTMENT', type: 'DEPARTMENT' }),
  ], 's2');
  assert.deepEqual(offices.map((office) => office.id), ['h', 's1']);
  assert.equal(describeOfficeOption(unit({ kind: 'HEAD_OFFICE', name: 'Raipur Head Office' })), 'Raipur Head Office · Head office');
  assert.equal(describeOfficeOption(unit({ name: 'Western Office', state: { id: 2, name: 'Maharashtra' } })), 'Western Office · Maharashtra');
  assert.equal(describeOfficeOption(unit({ name: 'Gujarat State Office', state: { id: 1, name: 'Gujarat' } })), 'Gujarat State Office');
});

test('transfer: a state office needs a city, a head office does not, dates and manager are checked', () => {
  const base = { ...createTransferForm(TODAY, 'o1') };
  assert.deepEqual(validateTransferForm({ ...base, toOfficeUnitId: '' }, { today: TODAY, destinationKind: null, employeeId: 'e1' }), { toOfficeUnitId: 'Select the office.' });
  assert.deepEqual(Object.keys(validateTransferForm(base, { today: TODAY, destinationKind: 'STATE', employeeId: 'e1' })), ['cityId']);
  assert.deepEqual(validateTransferForm(base, { today: TODAY, destinationKind: 'HEAD_OFFICE', employeeId: 'e1' }), {});
  assert.deepEqual(validateTransferForm({ ...base, cityId: '5', effectiveFrom: shiftDay(TODAY, -120) }, { today: TODAY, destinationKind: 'STATE', employeeId: 'e1' }), { effectiveFrom: 'The date cannot be more than 90 days in the past.' });
  assert.ok(validateTransferForm({ ...base, manager: setManager('e1') }, { today: TODAY, destinationKind: 'HEAD_OFFICE', employeeId: 'e1' }).manager);
  assert.ok(validateTransferForm({ ...base, reason: 'x'.repeat(501) }, { today: TODAY, destinationKind: 'HEAD_OFFICE', employeeId: 'e1' }).reason);
});

test('transfer payload: omits what was not chosen and only clears the manager role when asked', () => {
  const state = { ...createTransferForm(TODAY, 'o1'), cityId: '77', designation: '  State Manager ', reason: ' moved ' };
  assert.deepEqual(toTransferPayload(state, { destinationKind: 'STATE', managesOffice: false }), {
    toOfficeUnitId: 'o1', effectiveFrom: TODAY, cityId: 77, designation: 'State Manager', reason: 'moved',
  });
  assert.equal('isOfficeManager' in toTransferPayload(state, { destinationKind: 'STATE', managesOffice: true }), false);
  assert.equal(toTransferPayload({ ...state, keepManagerRole: false }, { destinationKind: 'STATE', managesOffice: true }).isOfficeManager, false);
  assert.equal('isOfficeManager' in toTransferPayload({ ...state, keepManagerRole: false }, { destinationKind: 'HEAD_OFFICE', managesOffice: true }), false);
  const head = toTransferPayload({ ...state, orgUnitId: 'dept', manager: { mode: 'none', employeeId: '' } }, { destinationKind: 'HEAD_OFFICE', managesOffice: false });
  assert.equal('cityId' in head, false);
  assert.equal(head.orgUnitId, 'dept');
  assert.equal(head.managerEmployeeId, null);
});

test('deactivate: the reason is required and people who report to them need a new manager', () => {
  const form = createDeactivateForm(TODAY);
  const context = { todayUtc: TODAY, directReports: 0, employeeId: 'e1' };
  assert.deepEqual(Object.keys(validateDeactivateForm(form, context)), ['reason']);
  assert.deepEqual(validateDeactivateForm({ ...form, reason: 'Resigned' }, context), {});
  assert.match(validateDeactivateForm({ ...form, reason: 'ab' }, context).reason ?? '', /at least 3/);
  assert.deepEqual(Object.keys(validateDeactivateForm({ ...form, reason: 'Resigned' }, { ...context, directReports: 2 })), ['reassignToId']);
  assert.match(validateDeactivateForm({ ...form, reason: 'Resigned', reassignToId: 'e1' }, { ...context, directReports: 2 }).reassignToId ?? '', /someone else/);
  assert.match(validateDeactivateForm({ ...form, reason: 'Resigned', effectiveDate: shiftDay(TODAY, 1) }, context).effectiveDate ?? '', /future/);
  assert.deepEqual(toDeactivatePayload({ ...form, reason: ' Resigned ', reassignToId: 'm1' }, { hasLogin: true, directReports: 2 }), {
    outcome: 'EXITED', effectiveDate: TODAY, reason: 'Resigned', reassignReportsToEmployeeId: 'm1', disableLogin: true,
  });
  assert.deepEqual(toDeactivatePayload({ ...form, reason: 'Hold', outcome: 'SUSPENDED', reassignToId: 'm1' }, { hasLogin: false, directReports: 0 }), {
    outcome: 'SUSPENDED', effectiveDate: TODAY, reason: 'Hold',
  });
});

test('appoint: the city is only needed when the person works somewhere else', () => {
  const form = { ...createAppointForm(TODAY, 'State Manager', 'nom'), employeeId: 'e2' };
  assert.deepEqual(Object.keys(validateAppointForm(form, { today: TODAY, alreadyInOffice: false })), ['cityId']);
  assert.deepEqual(validateAppointForm(form, { today: TODAY, alreadyInOffice: true }), {});
  assert.deepEqual(Object.keys(validateAppointForm({ ...form, employeeId: '' }, { today: TODAY, alreadyInOffice: true })), ['employeeId']);
  assert.match(validateAppointForm({ ...form, manager: setManager('e2') }, { today: TODAY, alreadyInOffice: true }).manager ?? '', /themselves/);
  assert.deepEqual(toAppointPayload({ ...form, cityId: '9', reason: '' }), {
    employeeId: 'e2', effectiveFrom: TODAY, cityId: 9, managerEmployeeId: 'nom', designation: 'State Manager',
  });
  assert.equal(createAppointForm(TODAY, 'State Manager').manager.mode, 'keep');
});

test('replace: a different person, city rules and the three things that can happen to the outgoing manager', () => {
  const form = { ...createReplaceForm(TODAY), incomingEmployeeId: 'in1' };
  const context = { today: TODAY, outgoingEmployeeId: 'out1', incomingAlreadyInOffice: true, transferKind: null as null | 'STATE' | 'HEAD_OFFICE' };
  assert.deepEqual(validateReplaceForm(form, context), {});
  assert.deepEqual(Object.keys(validateReplaceForm({ ...form, incomingEmployeeId: '' }, context)), ['incomingEmployeeId']);
  assert.match(validateReplaceForm({ ...form, incomingEmployeeId: 'out1' }, context).incomingEmployeeId ?? '', /different person/);
  assert.deepEqual(Object.keys(validateReplaceForm(form, { ...context, incomingAlreadyInOffice: false })), ['incomingCityId']);
  assert.deepEqual(Object.keys(validateReplaceForm({ ...form, outgoingAction: 'TRANSFER' }, context)), ['transferOfficeId']);
  assert.deepEqual(Object.keys(validateReplaceForm({ ...form, outgoingAction: 'TRANSFER', transferOfficeId: 'o2' }, { ...context, transferKind: 'STATE' })), ['transferCityId']);
  assert.deepEqual(validateReplaceForm({ ...form, outgoingAction: 'TRANSFER', transferOfficeId: 'o2' }, { ...context, transferKind: 'HEAD_OFFICE' }), {});

  assert.deepEqual(toReplacePayload(form, { outgoingEmployeeId: 'out1', transferKind: null }), {
    outgoingEmployeeId: 'out1', incomingEmployeeId: 'in1', effectiveFrom: TODAY, outgoing: { action: 'KEEP_AS_MEMBER' },
  });
  assert.deepEqual(toReplacePayload({ ...form, incomingCityId: '3', outgoingAction: 'TRANSFER', transferOfficeId: 'o2', transferCityId: '8', transferOrgUnitId: 'd1', manager: setManager('boss'), reason: ' r ' }, { outgoingEmployeeId: 'out1', transferKind: 'STATE' }), {
    outgoingEmployeeId: 'out1', incomingEmployeeId: 'in1', effectiveFrom: TODAY, incomingCityId: 3, managerEmployeeId: 'boss', reason: 'r',
    outgoing: { action: 'TRANSFER', toOfficeUnitId: 'o2', cityId: 8, orgUnitId: 'd1' },
  });
  assert.deepEqual(toReplacePayload({ ...form, outgoingAction: 'DEACTIVATE', deactivateOutcome: 'SUSPENDED', disableLogin: false }, { outgoingEmployeeId: 'out1', transferKind: null }).outgoing, { action: 'DEACTIVATE', outcome: 'SUSPENDED', disableLogin: false });
});

test('result texts warn when a state is left without a manager', () => {
  assert.equal(describeMoveResult({ vacatedOfficeId: null }, {}, 'Transfer saved'), 'Transfer saved.');
  assert.equal(describeMoveResult({ vacatedOfficeId: 'o1' }, { o1: 'Gujarat State Office' }, 'Transfer saved'), 'Transfer saved. Gujarat State Office now has no manager.');
  assert.equal(describeMoveResult({ vacatedOfficeId: 'zz' }), 'Change saved. A state office now has no manager.');
  assert.equal(
    describeDeactivation({ employeeCode: 'EMP-0004', reportsMoved: 2, loginDisabled: true, vacatedOfficeIds: ['o1'] }, 'EXITED', { o1: 'Gujarat State Office' }),
    'EMP-0004 marked as exited · 2 people now report to the new manager · login disabled. Gujarat State Office now has no manager.',
  );
  assert.equal(describeDeactivation({ employeeCode: 'EMP-0005', reportsMoved: 0, loginDisabled: false, vacatedOfficeIds: [] }, 'SUSPENDED'), 'EMP-0005 suspended.');
  assert.equal(describeReplaceResult({ reportsMoved: 1 }, 'Gujarat State Office'), 'Gujarat State Office has a new manager. 1 person now reports to them.');
  assert.equal(describeReplaceResult({ reportsMoved: 0 }, 'Gujarat State Office'), 'Gujarat State Office has a new manager.');
});

test('replace: takes effect today or earlier only, with a clear message for a future date', () => {
  const form = { ...createReplaceForm(TODAY), incomingEmployeeId: 'in1' };
  const context = { today: TODAY, outgoingEmployeeId: 'out1', incomingAlreadyInOffice: true, transferKind: null as null | 'STATE' | 'HEAD_OFFICE' };
  assert.deepEqual(validateReplaceForm({ ...form, effectiveFrom: shiftDay(TODAY, -90) }, context), {});
  assert.equal(validateReplaceForm({ ...form, effectiveFrom: shiftDay(TODAY, 1) }, context).effectiveFrom, REPLACE_DATE_MESSAGE);
  assert.match(REPLACE_DATE_MESSAGE, /appoint the new manager and transfer the old one/);
  assert.match(validateReplaceForm({ ...form, effectiveFrom: shiftDay(TODAY, -91) }, context).effectiveFrom ?? '', /90 days in the past/);
  assert.match(validateReplaceForm({ ...form, effectiveFrom: '2026-02-31' }, context).effectiveFrom ?? '', /valid date/);
  assert.match(validateReplaceForm({ ...form, effectiveFrom: '' }, context).effectiveFrom ?? '', /Select the date/);
});

test('dialogs use the server day (IST): early morning in India is already the new day there', () => {
  // 01:30 on 26 Nov in India (UTC+5:30) is 20:00 on 25 Nov UTC: the server (IST) already says 26 Nov.
  const earlyIndia = new Date('2026-11-25T20:00:00.000Z');
  assert.equal(toServerDay(earlyIndia), '2026-11-26');
  assert.equal(toUtcDay(earlyIndia), '2026-11-25');
  assert.deepEqual(effectiveDateBounds(toServerDay(earlyIndia), false), { min: '2026-08-28', max: '2026-11-26' });
  assert.equal(validateEffectiveDate('2026-11-26', toServerDay(earlyIndia), { allowFuture: false }), '');
  assert.equal(validateEffectiveDate('2026-11-27', toServerDay(earlyIndia), { allowFuture: false }), 'The date cannot be in the future.');
  // Late evening in India is still the same day there (IST and UTC agree).
  assert.equal(toServerDay(new Date('2026-11-25T17:00:00.000Z')), '2026-11-25');
});

test('replace: the outgoing manager may get a new designation, but not when they are deactivated', () => {
  const form = { ...createReplaceForm(TODAY), incomingEmployeeId: 'in1', outgoingDesignation: '  Senior Executive ' };
  const context = { outgoingEmployeeId: 'out1', transferKind: null as null | 'STATE' | 'HEAD_OFFICE' };
  assert.deepEqual(toReplacePayload(form, context).outgoing, { action: 'KEEP_AS_MEMBER', designation: 'Senior Executive' });
  assert.deepEqual(toReplacePayload({ ...form, outgoingDesignation: '' }, context).outgoing, { action: 'KEEP_AS_MEMBER' });
  assert.deepEqual(
    toReplacePayload({ ...form, outgoingAction: 'TRANSFER', transferOfficeId: 'o2', transferCityId: '8' }, { outgoingEmployeeId: 'out1', transferKind: 'STATE' }).outgoing,
    { action: 'TRANSFER', toOfficeUnitId: 'o2', cityId: 8, designation: 'Senior Executive' },
  );
  assert.deepEqual(toReplacePayload({ ...form, outgoingAction: 'DEACTIVATE' }, context).outgoing, { action: 'DEACTIVATE', outcome: 'EXITED', disableLogin: true });
  const base = { today: TODAY, outgoingEmployeeId: 'out1', incomingAlreadyInOffice: true, transferKind: null as null | 'STATE' | 'HEAD_OFFICE' };
  assert.ok(validateReplaceForm({ ...form, outgoingDesignation: 'x'.repeat(121) }, base).outgoingDesignation);
  assert.equal(validateReplaceForm({ ...form, outgoingAction: 'DEACTIVATE', outgoingDesignation: 'x'.repeat(121) }, base).outgoingDesignation, undefined);
});

test('deactivating the outgoing manager is only offered with hrm.employees.manage', () => {
  assert.deepEqual(outgoingActionOptions(true).map((option) => option.id), ['KEEP_AS_MEMBER', 'TRANSFER', 'DEACTIVATE']);
  assert.deepEqual(outgoingActionOptions(false).map((option) => option.id), ['KEEP_AS_MEMBER', 'TRANSFER']);
});

test('a manager who goes to the head office, or gives the role up, needs a new designation', () => {
  assert.equal(stopsBeingManager({ managesOffice: true, destinationKind: 'HEAD_OFFICE', keepManagerRole: true }), true);
  assert.equal(stopsBeingManager({ managesOffice: true, destinationKind: 'STATE', keepManagerRole: false }), true);
  assert.equal(stopsBeingManager({ managesOffice: true, destinationKind: 'STATE', keepManagerRole: true }), false);
  assert.equal(stopsBeingManager({ managesOffice: false, destinationKind: 'HEAD_OFFICE', keepManagerRole: true }), false);
  assert.equal(stopsBeingManager({ managesOffice: true, destinationKind: null, keepManagerRole: false }), false);
});

test('server error codes are read from the response', () => {
  assert.equal(errorCodeOf({ response: { data: { code: DESIGNATION_REQUIRED_CODE, error: 'x' } } }), 'DESIGNATION_REQUIRED');
  assert.equal(errorCodeOf({ response: { data: { error: 'x' } } }), '');
  assert.equal(errorCodeOf(new Error('boom')), '');
  assert.equal(errorCodeOf(null), '');
});

test('the replace toast names a state the replacement left without a manager', () => {
  assert.equal(
    describeReplaceResult({ reportsMoved: 2, vacatedOfficeId: 'o9' }, 'Gujarat State Office', { o9: 'Goa State Office' }),
    'Gujarat State Office has a new manager. 2 people now report to them. Goa State Office now has no manager.',
  );
  assert.equal(describeReplaceResult({ reportsMoved: 0, vacatedOfficeId: 'zz' }, 'Gujarat State Office'), 'Gujarat State Office has a new manager. A state office now has no manager.');
  assert.equal(describeReplaceResult({ reportsMoved: 0, vacatedOfficeId: null }, 'Gujarat State Office'), 'Gujarat State Office has a new manager.');
});

test('National Operations Manager tile and the coverage chip', () => {
  assert.deepEqual(describeNationalManagers([]), { value: 'Not set', hint: 'No one holds this designation yet.' });
  assert.equal(describeNationalManagers([{ name: 'Asha' }]).value, 'Asha');
  assert.equal(describeNationalManagers([{ name: 'Asha' }, { name: 'Ravi' }]).value, '2 people');
  assert.equal(officeCoverageLabel({ kind: 'STATE', isActive: true }, 0), 'Vacant');
  assert.equal(officeCoverageLabel({ kind: 'STATE', isActive: true }, 2), 'Covered');
  assert.equal(officeCoverageLabel({ kind: 'STATE', isActive: false }, 0), null);
  assert.equal(officeCoverageLabel({ kind: 'HEAD_OFFICE', isActive: true }, 0), null);
});
