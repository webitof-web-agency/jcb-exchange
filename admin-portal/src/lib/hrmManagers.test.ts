import assert from 'node:assert/strict';
import test from 'node:test';

import {
  EMPTY_MANAGER_SELECTION, chosenManager, describeManagerChange, forgetSuggestedManager, managerChangeWindow, managerDetail, managerLabels, managerWarning,
  openPostingOf, suggestedManager, toManagerParams, validateManagerChange, type ManagerPick,
} from './hrmManagers';
import { toAssignmentPayload, createEmptyAssignmentForm } from './hrmAssignment';
import { countActiveFilters, parseDirectoryParams, toDirectoryApiQuery, toDirectorySearch } from './hrmDirectory';

const person: ManagerPick = {
  id: 'm1', name: 'Meghraj', employeeCode: 'EMP-0004', designation: 'State Manager', role: 'Manager role', hasLogin: true, department: 'Sales',
  officeType: 'REGION', officeName: 'Madhya Pradesh State Office', stateId: 20, cityName: 'Indore', directReports: 6, status: 'ACTIVE', chargeStateIds: [], isNational: false,
};

test('the name comes with the job and the role side by side', () => {
  assert.deepEqual(managerLabels(person), { designation: 'State Manager', role: 'Role: Manager role' });
  assert.equal(managerLabels({ ...person, hasLogin: false }).role, 'No login');
  assert.equal(managerLabels({ ...person, role: null }).role, 'No role');
  // A stored offer keeps only the id and name: nothing is made up.
  assert.deepEqual(managerLabels({ id: 'x', name: 'X' }), { designation: null, role: null });
  assert.equal(managerDetail(person), 'EMP-0004 · Sales · Indore · 6 reports');
  assert.equal(managerDetail({ ...person, officeType: 'HEAD_OFFICE', cityName: 'Raipur', directReports: 1, status: 'ON_LEAVE' }), 'EMP-0004 · Sales · Head office, Raipur · 1 report · On Leave');
});

test('only a manager from another state office is pointed out', () => {
  const gujarat = { kind: 'STATE' as const, stateId: 24, stateName: 'Gujarat' };
  assert.equal(managerWarning(person, gujarat), 'Works from Madhya Pradesh State Office, not in Gujarat.');
  assert.equal(managerWarning(person, { ...gujarat, stateId: 20 }), null);
  assert.equal(managerWarning({ ...person, chargeStateIds: [24] }, gujarat), null);
  assert.equal(managerWarning({ ...person, isNational: true }, gujarat), null);
  assert.equal(managerWarning({ ...person, officeType: 'HEAD_OFFICE', stateId: null }, gujarat), null);
  assert.equal(managerWarning(person, { kind: 'HEAD_OFFICE', stateId: null, stateName: null }), null);
  assert.equal(managerWarning(person, undefined), null);
});

test('query values: a head office needs no state; empty ones are left out', () => {
  assert.deepEqual(toManagerParams({ employeeId: 'e', headOffice: true, stateId: 24, managerRole: false }), { employeeId: 'e', headOffice: 'true', managerRole: 'false' });
  assert.deepEqual(toManagerParams({ stateId: '24' }, '  meg  '), { stateId: '24', search: 'meg' });
  assert.deepEqual(toManagerParams({ stateId: '' }), {});
  assert.deepEqual(toManagerParams({ employeeId: 'e', purpose: 'successor' }), { employeeId: 'e', purpose: 'successor' });
});

test('a suggestion fills the field but never replaces what HR chose or removed', () => {
  const auto = suggestedManager(EMPTY_MANAGER_SELECTION, person);
  assert.equal(auto.source, 'auto');
  assert.deepEqual(forgetSuggestedManager(auto), EMPTY_MANAGER_SELECTION);
  assert.deepEqual(suggestedManager(auto, null), EMPTY_MANAGER_SELECTION, 'the new place has nobody obvious');
  const picked = chosenManager({ id: 'other', name: 'Other' });
  assert.equal(suggestedManager(picked, person), picked);
  assert.equal(forgetSuggestedManager(picked), picked);
  const removed = chosenManager(null);
  assert.equal(suggestedManager(removed, person), removed);
});

test('change manager builds on the newest open assignment, within the server dates', () => {
  const rows = [
    { id: 'old', status: 'ENDED', effectiveFrom: '2026-01-01', effectiveTo: '2026-06-30' },
    { id: 'now', status: 'ACTIVE', effectiveFrom: '2026-07-01', effectiveTo: null },
  ];
  assert.equal(openPostingOf(rows)?.id, 'now');
  assert.equal(openPostingOf([{ ...rows[1]!, effectiveTo: '2026-12-01' }]), null);
  assert.equal(openPostingOf([]), null);
  assert.deepEqual(managerChangeWindow('2025-01-01T00:00:00.000Z', '2026-11-26'), { min: '2026-08-28', max: '2027-11-26', initial: '2026-11-26', startsLater: false, began: '2025-01-01' });
  assert.equal(managerChangeWindow('2026-11-20', '2026-11-26').min, '2026-11-20');
  const later = managerChangeWindow('2026-12-10', '2026-11-26');
  assert.deepEqual([later.min, later.initial, later.startsLater], ['2026-12-10', '2026-12-10', true]);
});

test('change manager: what is refused, and how it is confirmed', () => {
  const context = { currentId: 'boss', selfId: 'me', min: '2026-11-01', max: '2027-11-26' };
  const form = { mode: 'set' as const, managerId: 'new', effectiveFrom: '2026-11-26', reason: '' };
  assert.deepEqual(validateManagerChange(form, context), {});
  assert.match(validateManagerChange({ ...form, managerId: '' }, context).manager ?? '', /Choose/);
  assert.match(validateManagerChange({ ...form, managerId: 'me' }, context).manager ?? '', /themselves/);
  assert.match(validateManagerChange({ ...form, managerId: 'boss' }, context).manager ?? '', /already report/);
  assert.deepEqual(validateManagerChange({ ...form, mode: 'none', managerId: '' }, context), {});
  assert.match(validateManagerChange({ ...form, mode: 'none' }, { ...context, currentId: null }).manager ?? '', /no reporting manager/);
  assert.match(validateManagerChange({ ...form, effectiveFrom: '2026-10-01' }, context).effectiveFrom ?? '', /or later/);
  assert.match(validateManagerChange({ ...form, effectiveFrom: '' }, context).effectiveFrom ?? '', /date/);
  assert.equal(describeManagerChange({ name: 'Asha', managerName: 'Ravi', effectiveFrom: '2026-11-26', today: '2026-11-26' }), 'Asha reports to Ravi.');
  assert.match(describeManagerChange({ name: 'Asha', managerName: null, effectiveFrom: '2026-12-01', today: '2026-11-26' }), /no reporting manager from/);
});

test('add assignment sends the manager only when one is chosen', () => {
  const form = { ...createEmptyAssignmentForm('2026-11-26', 'ho-1'), orgUnitId: 'd', designation: 'Executive' };
  assert.equal('managerEmployeeId' in toAssignmentPayload(form), false);
  assert.equal('managerEmployeeId' in toAssignmentPayload(form, null), false);
  assert.equal(toAssignmentPayload(form, 'm1').managerEmployeeId, 'm1');
});

test('the directory remembers the reporting manager filter in the address', () => {
  const filters = parseDirectoryParams(new URLSearchParams('manager=missing'));
  assert.equal(filters.manager, 'missing');
  assert.equal(countActiveFilters(filters), 1);
  assert.equal(toDirectorySearch(filters), 'manager=missing');
  assert.equal(toDirectoryApiQuery(filters).manager, 'missing');
  assert.equal(parseDirectoryParams(new URLSearchParams('manager=anything')).manager, '');
  assert.equal('manager' in toDirectoryApiQuery(parseDirectoryParams(new URLSearchParams(''))), false);
});
