import assert from 'node:assert/strict';
import test from 'node:test';
import { describeJoiningDateProblem, suggestScopes } from './joiningRules';

test('a State Manager is offered their own state (following the placement) and their reports', () => {
  const scopes = suggestScopes({ officeKind: 'STATE', officeUnitId: 'mh', stateId: 27, stateName: 'Maharashtra', isOfficeManager: true, designation: 'State Manager' });
  assert.deepEqual(scopes.filter((scope) => scope.recommended).map((scope) => [scope.scopeType, scope.source, scope.stateId ?? null]), [['STATE', 'PLACEMENT', 27], ['DIRECT_REPORTS', 'MANUAL', null]]);
});

test('head office staff get options but nothing ticked; the National Operations Manager sees all of India', () => {
  const staff = suggestScopes({ officeKind: 'HEAD_OFFICE', officeUnitId: 'ho', stateId: 22, stateName: 'Chhattisgarh', isOfficeManager: false, designation: 'Accountant' });
  assert.equal(staff.filter((scope) => scope.recommended).length, 0);
  assert.ok(staff.some((scope) => scope.scopeType === 'HEAD_OFFICE' && scope.orgUnitId === 'ho'));
  assert.ok(staff.some((scope) => scope.scopeType === 'ALL_INDIA'));
  const nom = suggestScopes({ officeKind: 'HEAD_OFFICE', officeUnitId: 'ho', stateId: 22, stateName: 'Chhattisgarh', isOfficeManager: false, designation: 'National Operations Manager' });
  assert.ok(nom.some((scope) => scope.scopeType === 'ALL_INDIA' && scope.recommended));
  const field = suggestScopes({ officeKind: 'STATE', officeUnitId: 'mh', stateId: 27, stateName: 'Maharashtra', isOfficeManager: false, designation: 'Sales Executive' });
  assert.equal(field.filter((scope) => scope.recommended).length, 0, 'a field employee sees only their own record unless HR ticks more');
});

test('joining date: a real day, not in the future, not far before the plan', () => {
  assert.equal(describeJoiningDateProblem('2026-11-27', '2026-11-27', '2026-11-27'), null);
  assert.equal(describeJoiningDateProblem('2026-11-20', '2026-11-27', '2026-11-25'), null);
  assert.match(describeJoiningDateProblem('2026-11-28', '2026-11-27', null) ?? '', /future/);
  assert.match(describeJoiningDateProblem('2026-02-30', '2026-11-27', null) ?? '', /actually joined/);
  assert.match(describeJoiningDateProblem('2026-01-01', '2026-11-27', '2026-11-25') ?? '', /90 days/);
});
