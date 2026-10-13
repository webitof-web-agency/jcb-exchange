import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const routeSource = await readFile(
  fileURLToPath(new URL('./recruitment.routes.ts', import.meta.url)),
  'utf8',
);
const rtoAccessSection = routeSource.slice(
  routeSource.indexOf('const canViewRto'),
  routeSource.indexOf('const canViewApplications'),
);

test('allows Admin, Super Admin, and permitted Employees to use RTO endpoints', () => {
  assert.match(rtoAccessSection, /const canViewRto = requireAdminOrEmployeePermissions\(/);
  assert.match(rtoAccessSection, /const canCreateRto = requireAdminOrEmployeePermissions\(/);
  assert.match(rtoAccessSection, /const canUpdateRto = requireAdminOrEmployeePermissions\(/);
  assert.match(rtoAccessSection, /const canDeleteRto = requireAdminOrEmployeePermissions\(/);
});
