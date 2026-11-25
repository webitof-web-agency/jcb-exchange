import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import {
  canAssignRole,
  canGrantPermission,
  permissionsNotHeldBy,
  ROLE_EDITOR_PERMISSION_DATA,
  ROLE_EDITOR_PERMISSION_IDS,
  serverErrorMessage,
  toggleGrantableGroup,
} from './roleEditorCatalog';

// Backend keys the role editor deliberately does not offer. Each one is still accepted by the server so existing
// roles and logins keep working, but nobody should tick it for a new role.
const HIDDEN_BACKEND_PERMISSIONS: Record<string, string> = {
  ALL_ACCESS: 'Super-admin-level wildcard; only given by the Users screen / seed scripts, never through the role editor.',
  MANAGE_PARTNERS: 'Legacy coarse key from the old admin model (replaced by partners.*).',
  REVIEW_KYC: 'Legacy coarse key (replaced by kyc.*).',
  REVIEW_LISTINGS: 'Legacy coarse key (replaced by listings.*).',
  MANAGE_LEADS: 'Legacy coarse key (replaced by crm.* / enquiries.manage).',
  MANAGE_FINANCE: 'Legacy coarse key (replaced by finance.* / fh.*).',
  MANAGE_REFUNDS: 'Legacy coarse key (replaced by accounts.sell.refund.approve).',
  MANAGE_SUPPORT: 'Legacy coarse key with no current screen.',
  MANAGE_CMS: 'Legacy coarse key (replaced by blog.* / footer.manage).',
  MANAGE_SEO: 'Legacy coarse key with no current screen.',
  VIEW_REPORTS: 'Legacy coarse key (replaced by analytics.read / fh.reports.read).',
  MANAGE_SETTINGS: 'Legacy coarse key (replaced by settings.manage).',
  MANAGE_ADMINS: 'Legacy coarse key (replaced by users.* / roles.*).',
  MANAGE_RECRUITMENT: 'Legacy coarse key (replaced by recruitment.*).',
  'accounts.rto.crud': 'Legacy all-in-one RTO key, superseded by accounts.rto.create / update / delete (still honoured by the routes).',
  'accounts.sell.crud': 'Legacy all-in-one Sold Vehicles key, superseded by accounts.sell.create / update / delete (still honoured by the routes).',
};

const readBackendAllowedPermissions = async () => {
  const source = await readFile(new URL('../../../backend/src/utils/adminPermissions.ts', import.meta.url), 'utf8');
  const start = source.indexOf('allowedAdminPermissions');
  assert.notEqual(start, -1, 'backend allowedAdminPermissions not found');
  const listStart = source.indexOf('[', start);
  const listEnd = source.indexOf(']', listStart);
  const body = source
    .slice(listStart + 1, listEnd)
    .split('\n')
    .map((line) => line.replace(/\/\/.*$/, ''))
    .join('\n');
  const keys = [...body.matchAll(/'([^']+)'|"([^"]+)"/g)].map((match) => match[1] ?? match[2]);
  assert.ok(keys.length > 100, `expected the full backend list, got ${keys.length} keys`);
  return new Set(keys);
};

test('every backend permission is in the role editor or on the explicit hidden / legacy list', async () => {
  const backend = await readBackendAllowedPermissions();
  const catalog = new Set(ROLE_EDITOR_PERMISSION_IDS);
  const unlisted = [...backend].filter((key) => !catalog.has(key) && !(key in HIDDEN_BACKEND_PERMISSIONS));
  assert.deepEqual(unlisted, [], 'add these keys to the role editor catalog or to HIDDEN_BACKEND_PERMISSIONS');
});

test('every role editor permission is allowed by the backend, and hidden keys really exist there', async () => {
  const backend = await readBackendAllowedPermissions();
  assert.deepEqual(ROLE_EDITOR_PERMISSION_IDS.filter((key) => !backend.has(key)), []);
  assert.deepEqual(Object.keys(HIDDEN_BACKEND_PERMISSIONS).filter((key) => !backend.has(key)), []);
  assert.deepEqual(Object.keys(HIDDEN_BACKEND_PERMISSIONS).filter((key) => ROLE_EDITOR_PERMISSION_IDS.includes(key)), []);
});

test('role editor keys are unique', () => {
  assert.equal(new Set(ROLE_EDITOR_PERMISSION_IDS).size, ROLE_EDITOR_PERMISSION_IDS.length);
});

test('recruitment section offers Candidates and Recruitment Settings', () => {
  const groups = ROLE_EDITOR_PERMISSION_DATA.Recruitment;
  const ids = (name: string) => groups.find((group) => group.groupName === name)?.permissions.map((permission) => permission.id);
  assert.deepEqual(ids('Candidates'), ['recruitment.candidates.read', 'recruitment.candidates.update']);
  assert.deepEqual(ids('Recruitment Settings'), ['recruitment.settings.read', 'recruitment.settings.update']);
});

test('only Super Admin / ALL_ACCESS may give permissions they do not hold', () => {
  const hr = { role: 'EMPLOYEE', permissions: ['roles.update', 'hrm.employees.read'] };
  assert.equal(canGrantPermission(hr, 'hrm.employees.read'), true);
  assert.equal(canGrantPermission(hr, 'hrm.scope.all'), false);
  assert.equal(canGrantPermission({ role: 'SUPER_ADMIN', permissions: [] }, 'hrm.scope.all'), true);
  assert.equal(canGrantPermission({ role: 'EMPLOYEE', permissions: ['ALL_ACCESS'] }, 'hrm.scope.all'), true);
  // The legacy ADMIN role is not all-access.
  assert.equal(canGrantPermission({ role: 'ADMIN', permissions: ['users.read'] }, 'users.update'), false);
  assert.equal(canGrantPermission(null, 'users.read'), false);
  assert.deepEqual(permissionsNotHeldBy(hr, ['hrm.employees.read', 'hrm.scope.all', 'hrm.scope.all']), ['hrm.scope.all']);
  assert.equal(canAssignRole(hr, ['hrm.employees.read']), true);
  assert.equal(canAssignRole(hr, ['hrm.employees.read', 'ALL_ACCESS']), false);
  assert.equal(canAssignRole(hr, []), true);
});

test('Mark all only changes the keys the editor may give', () => {
  const hr = { role: 'EMPLOYEE', permissions: ['a', 'b'] };
  const ticked = toggleGrantableGroup(new Set(['c']), ['a', 'b', 'c', 'd'], hr);
  assert.deepEqual([...ticked].sort(), ['a', 'b', 'c']);
  const unticked = toggleGrantableGroup(ticked, ['a', 'b', 'c', 'd'], hr);
  assert.deepEqual([...unticked].sort(), ['c']);
  assert.deepEqual([...toggleGrantableGroup(new Set(['x']), ['y'], hr)], ['x']);
  assert.deepEqual([...toggleGrantableGroup(new Set<string>(), ['y', 'z'], { role: 'SUPER_ADMIN' })].sort(), ['y', 'z']);
});

test('serverErrorMessage shows the server reason, else the fallback', () => {
  assert.equal(serverErrorMessage({ response: { data: { error: 'This role would give access you do not have yourself.' } } }, 'x'), 'This role would give access you do not have yourself.');
  assert.equal(serverErrorMessage({ response: { data: { message: 'Forbidden here' } } }, 'x'), 'Forbidden here');
  assert.equal(serverErrorMessage({ response: { data: { error: '  ' } } }, 'fallback'), 'fallback');
  assert.equal(serverErrorMessage(new Error('boom'), 'fallback'), 'fallback');
});
