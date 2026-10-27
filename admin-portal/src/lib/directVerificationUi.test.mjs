import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const vehiclePage = readFileSync(new URL('../components/vehicleTransport/VehicleTransportPage.tsx', import.meta.url), 'utf8');
const apiClient = readFileSync(new URL('./api.ts', import.meta.url), 'utf8');

test('Vehicle & Transport does not expose the removed RC Mobile Number Check service', () => {
  assert.equal(vehiclePage.includes('RC_MOBILE_NUMBER_CHECK'), false);
  assert.equal(vehiclePage.includes('rc-mobile-number-check'), false);
});

test('the shared API client refreshes wallet state after direct provider requests', () => {
  assert.match(apiClient, /notifyApiBillingSummaryChanged/);
  assert.match(apiClient, /aadhaar-verification\/initialize/);
  for (const requestPath of [
    'driving-license-verification/verify',
    'rc-owner-history/verify',
    'rc-full/verify',
    'rc-challan-verification/verify',
    'chassis-to-rc/verify',
    'rc-to-mobile/verify',
    'mobile-to-rc/lookup',
  ]) {
    assert.match(apiClient, new RegExp(requestPath), `${requestPath} is not a wallet refresh trigger`);
  }
});
