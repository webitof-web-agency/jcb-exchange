import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const vehiclePage = readFileSync(new URL('../components/vehicleTransport/VehicleTransportPage.tsx', import.meta.url), 'utf8');
const apiClient = readFileSync(new URL('./api.ts', import.meta.url), 'utf8');
const featurePermissions = readFileSync(new URL('./featurePermissions.ts', import.meta.url), 'utf8');
const rolesPage = readFileSync(new URL('../app/(admin)/admin/users/roles/page.tsx', import.meta.url), 'utf8');
const backendRoutes = readFileSync(new URL('../../../backend/src/routes/index.ts', import.meta.url), 'utf8');
const listingRoutes = readFileSync(new URL('../../../backend/src/routes/listing.routes.ts', import.meta.url), 'utf8');
const rtoRoute = readFileSync(new URL('../../../backend/src/routes/recruitment.routes.ts', import.meta.url), 'utf8');
const rtoWorkspace = readFileSync(new URL('../components/accounts/rto/RtoWorkspace.tsx', import.meta.url), 'utf8');

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

test('the shared API client refreshes wallet state after direct provider requests', () => {
  assert.match(apiClient, /notifyApiBillingSummaryChanged/);
  assert.match(apiClient, /aadhaar-verification\/initialize/);
  for (const requestPath of [
    'driving-license-verification/verify',
    'rc-owner-history/verify',
    'rc-challan-verification/verify',
    'chassis-to-rc/verify',
    'rc-to-mobile/verify',
    'mobile-to-rc/lookup',
  ]) {
    assert.match(apiClient, new RegExp(requestPath), `${requestPath} is not a wallet refresh trigger`);
  }
});
