import assert from 'node:assert/strict';
import test from 'node:test';
import { OWN_RECORD_REASON, statusChanges, type StatusFacts } from './hrmStatus';

const all = { own: false, confirmJoining: true, useCancelJoining: true, editProfile: true, deactivate: true, reactivate: true };
const facts = (status: string, patch: Partial<StatusFacts> = {}): StatusFacts => ({ status, archived: false, abilities: all, ownLogin: false, openCase: false, superAdminLogin: false, ...patch });
const ids = (input: StatusFacts) => statusChanges(input).options.map((option) => option.id);

test('a working person moves between the working states, or is suspended / exited', () => {
  assert.deepEqual(ids(facts('ACTIVE')), ['SET_ON_LEAVE', 'SET_NOTICE', 'SUSPEND', 'EXIT']);
  assert.deepEqual(ids(facts('ON_LEAVE')), ['SET_ACTIVE', 'SET_NOTICE', 'SUSPEND', 'EXIT']);
  assert.deepEqual(ids(facts('NOTICE_PERIOD')), ['SET_ACTIVE', 'SET_ON_LEAVE', 'SUSPEND', 'EXIT']);
  assert.ok(statusChanges(facts('ACTIVE')).options.every((option) => option.blocked === null));
});

test('a joiner is confirmed, or closed by cancel joining (open case) or deactivating (no case)', () => {
  assert.deepEqual(ids(facts('DRAFT')), ['CONFIRM_JOINING', 'EXIT', 'SUSPEND']);
  assert.deepEqual(ids(facts('PRE_ONBOARDING', { openCase: true })), ['CONFIRM_JOINING', 'CANCEL_JOINING']);
  assert.deepEqual(ids(facts('ONBOARDING', { openCase: true })), ['CONFIRM_JOINING', 'CANCEL_JOINING']);
});

test('a suspended person is reactivated or exited; leavers and archived records are closed', () => {
  assert.deepEqual(ids(facts('SUSPENDED')), ['REACTIVATE', 'EXIT']);
  for (const input of [facts('EXITED'), facts('TERMINATED'), facts('DRAFT', { archived: true })]) {
    const result = statusChanges(input);
    assert.ok(result.closed);
    assert.equal(result.options.length, 0);
  }
});

test('a change that cannot be chosen says why', () => {
  const own = statusChanges(facts('ACTIVE', { abilities: { ...all, own: true, editProfile: false, deactivate: false }, ownLogin: true }));
  assert.equal(own.options.find((option) => option.id === 'SET_ON_LEAVE')!.blocked, OWN_RECORD_REASON);
  assert.match(own.options.find((option) => option.id === 'EXIT')!.blocked!, /own account/);
  const superAdmin = statusChanges(facts('ACTIVE', { superAdminLogin: true }));
  assert.match(superAdmin.options.find((option) => option.id === 'SUSPEND')!.blocked!, /Super Admin/);
  assert.equal(superAdmin.options.find((option) => option.id === 'SET_ON_LEAVE')!.blocked, null);
  const limited = statusChanges(facts('DRAFT', { abilities: { ...all, confirmJoining: false } }));
  assert.match(limited.options[0]!.blocked!, /hrm\.onboarding\.manage/);
});
