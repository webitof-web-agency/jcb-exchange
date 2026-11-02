import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const vehiclePage = readFileSync(new URL('../components/vehicleTransport/VehicleTransportPage.tsx', import.meta.url), 'utf8');
const apiClient = readFileSync(new URL('./api.ts', import.meta.url), 'utf8');
const featurePermissions = readFileSync(new URL('./featurePermissions.ts', import.meta.url), 'utf8');
const rolesPage = readFileSync(new URL('../app/(admin)/admin/users/roles/page.tsx', import.meta.url), 'utf8');
const backendRoutes = readFileSync(new URL('../../../backend/src/routes/index.ts', import.meta.url), 'utf8');
const mobileToRcMigration = readFileSync(new URL('../../../backend/prisma/migrations/20261102_0001_remove_mobile_to_rc_role_permission/migration.sql', import.meta.url), 'utf8');
const listingRoutes = readFileSync(new URL('../../../backend/src/routes/listing.routes.ts', import.meta.url), 'utf8');
const rtoRoute = readFileSync(new URL('../../../backend/src/routes/recruitment.routes.ts', import.meta.url), 'utf8');
const rtoWorkspace = readFileSync(new URL('../components/accounts/rto/RtoWorkspace.tsx', import.meta.url), 'utf8');
const billingService = readFileSync(new URL('../../../backend/src/services/apiWalletBilling.service.ts', import.meta.url), 'utf8');

test('Vehicle & Transport does not expose the removed RC Mobile Number Check service', () => {
  assert.equal(vehiclePage.includes('RC_MOBILE_NUMBER_CHECK'), false);
  assert.equal(vehiclePage.includes('rc-mobile-number-check'), false);
});

test('RC Full is removed from public vehicle services and role permissions', () => {
  assert.equal(vehiclePage.includes('RcFullPage'), false);
  assert.equal(vehiclePage.includes("'rc-full'"), false);
  assert.equal(vehiclePage.includes('RC_FULL'), false);
  assert.equal(featurePermissions.includes('rc.full.read'), false);
  assert.equal(featurePermissions.includes('RC_FULL_VIEW_PERMISSIONS'), false);
  assert.equal(rolesPage.includes('rc.full.read'), false);
  assert.equal(rolesPage.includes('View RC Full'), false);
  assert.equal(backendRoutes.includes("from './rcFull.routes'"), false);
  assert.equal(backendRoutes.includes("router.use('/rc-full'"), false);
  assert.match(listingRoutes, /vehicle-verification\/rc-full/);
  assert.match(listingRoutes, /verifyRcFullForListing/);
  assert.equal(rtoRoute.includes("['rc.full.read']"), false);
  assert.equal(rtoWorkspace.includes("['rc.full.read']"), false);
});

test('Mobile To RC is removed from active vehicle services and role permissions', () => {
  assert.equal(vehiclePage.includes('MobileToRcLookupPage'), false);
  assert.equal(vehiclePage.includes('mobile-to-rc'), false);
  assert.equal(featurePermissions.includes('rc.mobile-to-rc.read'), false);
  assert.equal(rolesPage.includes('rc.mobile-to-rc.read'), false);
  assert.equal(backendRoutes.includes("from './mobileToRcLookup.routes'"), false);
  assert.equal(backendRoutes.includes("router.use('/mobile-to-rc'"), false);
  assert.equal(billingService.includes("serviceKey: 'MOBILE_TO_RC'"), false);
  assert.match(mobileToRcMigration, /array_remove\("permissions", 'rc\.mobile-to-rc\.read'\)/);
  assert.match(mobileToRcMigration, /DELETE FROM "AdminPermission"/);
});

test('the shared API client refreshes wallet state after direct provider requests', () => {
  assert.match(apiClient, /notifyApiBillingSummaryChanged/);
  assert.match(apiClient, /aadhaar-verification\/initialize/);
  for (const requestPath of [
    'driving-license-verification/verify',
    'rc-owner-history/verify',
    'rc-challan-verification/verify',
    'chassis-to-rc/verify',
    'rc-to-mobile/verify',
  ]) {
    assert.match(apiClient, new RegExp(requestPath), `${requestPath} is not a wallet refresh trigger`);
  }
});
