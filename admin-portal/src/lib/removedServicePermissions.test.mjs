import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const readSource = (relativePath) => readFileSync(new URL(relativePath, import.meta.url), 'utf8');

test('RC Mobile Number Check is absent from role and runtime permission catalogs', () => {
  const rolePage = readSource('../app/(admin)/admin/users/roles/page.tsx');
  const featurePermissions = readSource('./featurePermissions.ts');
  const backendPermissions = readSource('../../../backend/src/utils/adminPermissions.ts');

  assert.equal(rolePage.includes('rc.mobile-number-check.read'), false);
  assert.equal(featurePermissions.includes('RC_MOBILE_NUMBER_CHECK_VIEW_PERMISSIONS'), false);
  assert.equal(backendPermissions.includes('rc.mobile-number-check.read'), false);
});

test('RC Mobile Number Check backend route is no longer registered', () => {
  const routes = readSource('../../../backend/src/routes/index.ts');
  assert.equal(routes.includes('rcMobileNumberCheckRoutes'), false);
});
