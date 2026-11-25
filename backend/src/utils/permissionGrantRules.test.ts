import test from 'node:test';
import assert from 'node:assert/strict';
import { permissionsNotHeld } from './permissionGrantRules';

test('nobody hands out a permission they do not hold', () => {
  const hr = new Set(['hrm.employees.read', 'hrm.employees.manage', 'users.create']);
  assert.deepEqual(permissionsNotHeld(hr, ['hrm.employees.read', 'users.create']), []);
  assert.deepEqual(permissionsNotHeld(hr, ['hrm.employees.read', 'hrm.scope.all', 'hrm.scope.all']), ['hrm.scope.all']);
  // ALL_ACCESS is only given by somebody who holds it.
  assert.deepEqual(permissionsNotHeld(hr, ['ALL_ACCESS']), ['ALL_ACCESS']);
  assert.deepEqual(permissionsNotHeld(new Set(['ALL_ACCESS']), ['ALL_ACCESS', 'roles.update']), []);
  assert.deepEqual(permissionsNotHeld(new Set(), []), []);
});
