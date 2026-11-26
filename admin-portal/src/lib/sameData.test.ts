import assert from 'node:assert/strict';
import test from 'node:test';
import { isSameData, isSameSessionUser } from './sameData';

const user = { id: 'u1', name: 'Asha', role: 'EMPLOYEE', permissions: ['a.read', 'b.read'], updatedAt: '2026-11-26T10:00:00Z' };

test('compares data by value, not by object identity or key order', () => {
  assert.equal(isSameData({ a: 1, b: [1, { c: 'x' }] }, { b: [1, { c: 'x' }], a: 1 }), true);
  assert.equal(isSameData({ a: 1 }, { a: 1, b: undefined }), true);
  assert.equal(isSameData({ a: 1 }, { a: 2 }), false);
  assert.equal(isSameData([1, 2], [2, 1]), false);
  assert.equal(isSameData([], {}), false);
  assert.equal(isSameData(null, {}), false);
});

test('a fresh copy of the same user is the same session user', () => {
  assert.equal(isSameSessionUser(user, { ...user, permissions: [...user.permissions] }), true);
  // The permission order and the row timestamp may differ between two answers.
  assert.equal(isSameSessionUser(user, { ...user, permissions: ['b.read', 'a.read'], updatedAt: '2026-11-26T10:05:00Z' }), true);
});

test('a real change of details or access is a different session user', () => {
  assert.equal(isSameSessionUser(user, { ...user, name: 'Asha K' }), false);
  assert.equal(isSameSessionUser(user, { ...user, permissions: ['a.read'] }), false);
  assert.equal(isSameSessionUser(user, { ...user, role: 'SUPER_ADMIN' }), false);
  assert.equal(isSameSessionUser(user, { ...user, customRoleId: 'r1' }), false);
  assert.equal(isSameSessionUser(null, user), false);
});
