import assert from 'node:assert/strict';
import test from 'node:test';
import { findReviewIssues, recruitmentViewOf, reviewPeople, type ReviewInput, type ReviewScope, type ReviewUser } from './accessReviewRules';

const day = (value: string) => new Date(`${value}T00:00:00.000Z`);
const today = day('2026-11-25');
const scope = (scopeType: string, stateId: number | null = null, from = '2026-01-01', to: string | null = null): ReviewScope => ({ scopeType, stateId, source: 'MANUAL', activeFrom: day(from), activeTo: to ? day(to) : null });
const user = (id: string, patch: Partial<ReviewUser> = {}): ReviewUser => ({
  userId: id, name: id, email: `${id}@jcb.com`, status: 'ACTIVE', role: 'EMPLOYEE', roleName: 'State Manager',
  permissions: ['hrm.employees.read'], employee: { id: `e-${id}`, employeeCode: `EMP-${id}`, name: id, status: 'ACTIVE', archived: false }, scopes: [], ...patch,
});
const holder = (id: string, userId: string | null = id, kind: 'PRIMARY' | 'CHARGE' = 'PRIMARY', until: string | null = null) => ({ employeeId: `e-${id}`, employeeCode: `EMP-${id}`, name: id, userId, kind, until });
const office = (id: string, stateId: number, holders: ReturnType<typeof holder>[]) => ({ officeId: id, officeName: `${id} office`, stateId, stateName: id, holders });
const input = (patch: Partial<ReviewInput>): ReviewInput => ({ today, users: [], offices: [], jobsWithoutState: [], stateNames: new Map([[1, 'Gujarat'], [2, 'Rajasthan']]), ...patch });
const codes = (value: ReviewInput) => findReviewIssues(value).map((issue) => issue.code).sort();

test('a manager with the right access has no problem', () => {
  assert.deepEqual(codes(input({ users: [user('ravi', { scopes: [scope('STATE', 1)] })], offices: [office('gj', 1, [holder('ravi')])] })), []);
});

test('manager without login, access or role; vacant office', () => {
  const found = codes(input({
    users: [user('meena', { permissions: [], roleName: null })],
    offices: [office('gj', 1, [holder('meena')]), office('rj', 2, [holder('nologin', null)]), office('mp', 3, [])],
  }));
  assert.deepEqual(found, ['MANAGER_NO_ACCESS', 'MANAGER_NO_LOGIN', 'MANAGER_NO_ROLE', 'VACANT_OFFICE']);
});

test('a State Manager with all-India or user management is flagged with what they hold', () => {
  const issues = findReviewIssues(input({
    users: [user('ravi', { permissions: ['recruitment.scope.all', 'users.read'], scopes: [scope('STATE', 1)] })],
    offices: [office('gj', 1, [holder('ravi')])],
  }));
  const wide = issues.find((issue) => issue.code === 'MANAGER_TOO_WIDE')!;
  assert.match(wide.detail, /recruitment\.scope\.all/);
  assert.match(wide.detail, /users\.read/);
});

test('access to a state they do not manage is listed; a charged state is not extra', () => {
  const users = [user('ravi', { scopes: [scope('STATE', 1), scope('STATE', 2)] })];
  const without = codes(input({ users, offices: [office('gj', 1, [holder('ravi')]), office('rj', 2, [holder('other', null)])] }));
  assert.ok(without.includes('EXTRA_STATE_ACCESS'));
  const withCharge = codes(input({ users, offices: [office('gj', 1, [holder('ravi')]), office('rj', 2, [holder('ravi', 'ravi', 'CHARGE', '2027-06-30')])] }));
  assert.deepEqual(withCharge, []);
});

test('a charge ending within 15 days is listed', () => {
  const users = [user('ravi', { scopes: [scope('STATE', 1)] })];
  assert.ok(codes(input({ users, offices: [office('gj', 1, [holder('ravi', 'ravi', 'CHARGE', '2026-12-05')])] })).includes('CHARGE_ENDING'));
  assert.ok(!codes(input({ users, offices: [office('gj', 1, [holder('ravi', 'ravi', 'CHARGE', '2026-12-20')])] })).includes('CHARGE_ENDING'));
});

test('stale access: the person left or the login is off; ended access is not stale', () => {
  const left = user('gone', { employee: { id: 'e-gone', employeeCode: 'EMP-9', name: 'gone', status: 'EXITED', archived: false }, scopes: [scope('STATE', 1)] });
  const off = user('off', { status: 'SUSPENDED', scopes: [scope('ALL_INDIA')] });
  const ended = user('done', { status: 'INACTIVE', scopes: [scope('STATE', 1, '2026-01-01', '2026-11-01')] });
  const found = findReviewIssues(input({ users: [left, off, ended] })).filter((issue) => issue.code === 'STALE_ACCESS').map((issue) => issue.person?.name);
  assert.deepEqual(found.sort(), ['gone', 'off']);
});

test('recruitment permission without any place shows nothing and is listed; jobs without a state too', () => {
  const recruiter = user('asha', { permissions: ['recruitment.jobs.read'] });
  assert.equal(recruitmentViewOf(recruiter, today), 'NONE');
  assert.equal(recruitmentViewOf({ ...recruiter, scopes: [scope('STATE', 1)] }, today), 'STATES');
  assert.equal(recruitmentViewOf({ ...recruiter, permissions: ['recruitment.jobs.read', 'recruitment.scope.all'] }, today), 'ALL');
  assert.equal(recruitmentViewOf(user('x'), today), 'NOT_USED');
  const found = codes(input({ users: [recruiter], jobsWithoutState: [{ id: 'j1', title: 'Driver', jobCode: 'JOB-1', location: 'Somewhere', status: 'PUBLISHED' }] }));
  assert.deepEqual(found, ['JOB_NO_STATE', 'RECRUITMENT_NO_REACH']);
});

test('people: who reaches what, and what they manage', () => {
  const people = reviewPeople(input({
    users: [user('ravi', { scopes: [scope('STATE', 2), scope('STATE', 1), scope('STATE', 1, '2027-01-01')] }), user('plain', { permissions: ['blog.read'] })],
    offices: [office('gj', 1, [holder('ravi')])],
  }));
  assert.equal(people.length, 1);
  assert.deepEqual(people[0]!.hr.states.map((state) => state.name), ['Gujarat', 'Rajasthan']);
  assert.equal(people[0]!.hr.allIndia, false);
  assert.deepEqual(people[0]!.manages.map((item) => item.kind), ['PRIMARY']);
});
