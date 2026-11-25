import assert from 'node:assert/strict';
import test from 'node:test';
import { buildEmployeeScopeWhere, scopeAssignmentMatcher, unitWithDescendants } from './scopeWhere';

const units = [
  { id: 'root', parentId: null }, { id: 'a', parentId: 'root' }, { id: 'a1', parentId: 'a' }, { id: 'b', parentId: 'root' },
];

test('department scope with children covers the whole subtree', () => {
  assert.deepEqual(unitWithDescendants('a', units).sort(), ['a', 'a1']);
  assert.deepEqual(scopeAssignmentMatcher({ scopeType: 'DEPARTMENT', orgUnitId: 'a', includeChildren: true }, 'me', units), { orgUnitId: { in: ['a', 'a1'] } });
  assert.deepEqual(scopeAssignmentMatcher({ scopeType: 'DEPARTMENT', orgUnitId: 'a', includeChildren: false }, 'me', units), { orgUnitId: { in: ['a'] } });
});

test('a state scope excludes head office staff; direct reports follow the manager', () => {
  assert.deepEqual(scopeAssignmentMatcher({ scopeType: 'STATE', stateId: 27, includeChildren: true }, 'me', units), { stateId: 27, OR: [{ officeUnitId: null }, { officeUnit: { type: { not: 'HEAD_OFFICE' } } }] });
  assert.deepEqual(scopeAssignmentMatcher({ scopeType: 'DIRECT_REPORTS', includeChildren: true }, 'me', units), { managerEmployeeId: 'me' });
  assert.equal(scopeAssignmentMatcher({ scopeType: 'OWN', includeChildren: true }, 'me', units), null);
  assert.equal(scopeAssignmentMatcher({ scopeType: 'STATE', stateId: null, includeChildren: true }, 'me', units), null);
});

test('without usable scopes only the own record is visible; otherwise own OR current OR upcoming', () => {
  const today = new Date('2026-11-28T00:00:00.000Z');
  assert.deepEqual(buildEmployeeScopeWhere([{ scopeType: 'OWN', includeChildren: true }], 'me', units, today), { id: 'me' });
  const where = buildEmployeeScopeWhere([{ scopeType: 'STATE', stateId: 27, includeChildren: true }], 'me', units, today) as { OR: unknown[] };
  assert.equal(where.OR.length, 3);
  assert.deepEqual(where.OR[0], { id: 'me' });
});
