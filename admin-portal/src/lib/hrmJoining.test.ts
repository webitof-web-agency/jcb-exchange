import assert from 'node:assert/strict';
import test from 'node:test';

import type { HrmJoiningContext } from './hrmApi';
import {
  buildConfirmJoiningPayload,
  createJoiningForm,
  defaultJoiningDate,
  describeScope,
  grantableScopeTypes,
  joiningErrorsFromServer,
  loginModeBlock,
  scopeBlock,
  scopeKey,
  validateJoiningForm,
} from './hrmJoining';

const context = (over: Partial<HrmJoiningContext> = {}): HrmJoiningContext => ({
  employee: { id: 'e1', employeeCode: 'EMP-0007', name: 'Ravi', legalName: 'Ravi Sharma', status: 'PRE_ONBOARDING', plannedJoiningDate: '2026-11-25', version: 3, personalEmail: 'ravi@gmail.com', mobile: '9876543210' },
  canBeConfirmed: true,
  case: { id: 'c1', status: 'IN_PROGRESS' },
  checklist: [],
  progress: { done: 10, total: 10, percent: 100, missingRequired: [] },
  placement: { designation: 'State Manager', department: 'Sales', office: { id: 'mh', name: 'Maharashtra State Office', kind: 'STATE' }, state: { id: 27, name: 'Maharashtra' }, isOfficeManager: true, effectiveFrom: '2026-11-25' },
  suggestedScopes: [
    { scopeType: 'STATE', stateId: 27, source: 'PLACEMENT', label: 'Everyone in Maharashtra', recommended: true, reason: '' },
    { scopeType: 'DIRECT_REPORTS', source: 'MANUAL', label: 'Reports', recommended: true, reason: '' },
    { scopeType: 'ALL_INDIA', source: 'MANUAL', label: 'All of India', recommended: false, reason: '' },
  ],
  login: null,
  roles: [{ id: 'r1', name: 'State Manager' }],
  suggestedRoleId: 'r1',
  today: '2026-11-27',
  abilities: { canConfirm: true, canCreateLogin: true, canLinkLogin: true, canUpdateLogin: true, canManageScopes: true, allIndia: false },
  ...over,
});

test('the form starts with the planned date (not after today), a new login and the recommended access', () => {
  assert.equal(defaultJoiningDate('2026-11-25', '2026-11-27'), '2026-11-25');
  assert.equal(defaultJoiningDate('2026-12-01', '2026-11-27'), '2026-11-27');
  const form = createJoiningForm(context());
  assert.equal(form.loginMode, 'CREATE');
  assert.equal(form.roleId, 'r1');
  assert.deepEqual(form.scopeKeys, [scopeKey({ scopeType: 'STATE', stateId: 27 }), scopeKey({ scopeType: 'DIRECT_REPORTS' })]);
  const rehire = createJoiningForm(context({ login: { id: 'u1', email: 'r@x.com', mobile: null, status: 'INACTIVE', role: 'EMPLOYEE', customRole: null } }));
  assert.equal(rehire.loginMode, 'KEEP');
  assert.equal(rehire.keepReactivate, true);
});

test('login options and access follow the abilities', () => {
  assert.match(loginModeBlock('CREATE', context({ abilities: { ...context().abilities, canCreateLogin: false } })) ?? '', /users.create/);
  assert.match(loginModeBlock('KEEP', context()) ?? '', /no login/);
  assert.match(scopeBlock({ scopeType: 'ALL_INDIA' }, context().abilities, 'CREATE') ?? '', /all-India/);
  assert.match(scopeBlock({ scopeType: 'STATE', stateId: 27 }, context().abilities, 'NONE') ?? '', /needs a login/);
  assert.deepEqual(grantableScopeTypes({ canManageScopes: true, allIndia: false }), ['STATE', 'DIRECT_REPORTS']);
  assert.deepEqual(grantableScopeTypes({ canManageScopes: false, allIndia: true }), []);
});

test('the form is checked before sending', () => {
  const ctx = context({ progress: { done: 8, total: 10, percent: 80, missingRequired: ['BANK', 'PHOTO'] } });
  const form = { ...createJoiningForm(ctx), joiningDate: '2026-11-28' };
  const errors = validateJoiningForm(form, ctx);
  assert.match(errors.joiningDate ?? '', /future/);
  assert.match(errors.email ?? '', /work email/);
  assert.match(errors.password ?? '', /8 characters/);
  assert.match(errors.overrideReason ?? '', /checklist/);
  const ok = validateJoiningForm({ ...form, joiningDate: '2026-11-26', email: 'ravi@jcb.com', password: 'Secret#123', overrideReason: 'Bank next week' }, ctx);
  assert.deepEqual(ok, {});
  assert.match(validateJoiningForm({ ...form, loginMode: 'NONE', joiningDate: '2026-11-26', overrideReason: 'x x x' }, ctx).noneReason ?? '', /Say why/);
});

test('payload: only what the server schema takes', () => {
  const ctx = context();
  const form = { ...createJoiningForm(ctx), email: ' ravi@jcb.com ', password: 'Secret#123', mobile: '+91 98765 43210' };
  assert.deepEqual(buildConfirmJoiningPayload(form, ctx), {
    version: 3,
    joiningDate: '2026-11-25',
    login: { mode: 'CREATE', email: 'ravi@jcb.com', password: 'Secret#123', mobile: '9876543210', customRoleId: 'r1' },
    scopes: [{ scopeType: 'STATE', stateId: 27, source: 'PLACEMENT' }, { scopeType: 'DIRECT_REPORTS', source: 'MANUAL' }],
  });
  const none = buildConfirmJoiningPayload({ ...form, loginMode: 'NONE', noneReason: 'Field staff' }, ctx);
  assert.deepEqual(none.login, { mode: 'NONE', reason: 'Field staff' });
  assert.equal(none.scopes, undefined, 'no access without a login');
  const keepCtx = context({ login: { id: 'u1', email: 'r@x.com', mobile: null, status: 'ACTIVE', role: 'EMPLOYEE', customRole: { id: 'r1', name: 'State Manager' } } });
  const keep = buildConfirmJoiningPayload({ ...createJoiningForm(keepCtx), keepReactivate: true, keepChangeRole: true, keepRoleId: '' }, keepCtx);
  assert.deepEqual(keep.login, { mode: 'KEEP', customRoleId: null }, 'an active login is not "switched on"; clearing the role sends null');
});

test('payload: the welcome message is sent only when HR ticks it', () => {
  const ctx = context();
  const form = { ...createJoiningForm(ctx), loginMode: 'NONE' as const, noneReason: 'Field staff' };
  assert.equal(form.sendWelcome, false, 'unticked by default');
  assert.equal('sendWelcome' in buildConfirmJoiningPayload(form, ctx), false, 'no key when unticked (strict server schema)');
  assert.equal(buildConfirmJoiningPayload({ ...form, sendWelcome: true }, ctx).sendWelcome, true);
});

test('server errors land on their fields', () => {
  const failure = (data: unknown) => ({ response: { data } });
  assert.deepEqual(joiningErrorsFromServer(failure({ error: 'x', details: [{ path: ['login', 'email'], message: 'Invalid email' }, { path: ['overrideReason'], message: 'Needed' }] })).fields, { email: 'Invalid email', overrideReason: 'Needed' });
  const duplicate = joiningErrorsFromServer(failure({ error: 'That email or mobile number is already used by another login.' }));
  assert.ok(duplicate.fields.email);
  assert.equal(joiningErrorsFromServer(failure({ error: 'Something else' })).banner, 'Something else');
  assert.equal(describeScope({ scopeType: 'STATE', state: { id: 27, name: 'Maharashtra' }, orgUnit: null }), 'State: Maharashtra');
});
