import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const here = dirname(fileURLToPath(import.meta.url));
// Normalised to LF: Windows checkouts use CRLF and the markers below are matched with "\n".
const readSource = (relativePath) => readFileSync(resolve(here, relativePath), 'utf8').replace(/\r\n/g, '\n');

test('vehicle transport overview does not render removed service cards', () => {
  const source = readSource('../components/vehicleTransport/VehicleTransportPage.tsx');
  const gridStart = source.indexOf('{/* Service Cards Grid */}');
  const emptyStateStart = source.indexOf('{/* Empty State */}');
  const cardGrid = source.slice(gridStart, emptyStateStart);

  assert.equal(cardGrid.includes('RC Mobile Number Check'), false, 'RC Mobile Number Check should not be rendered in the service card grid');
  assert.equal(cardGrid.includes('RC Owner History'), true, 'RC Owner History should remain available');
  assert.equal(cardGrid.includes('RC to Mobile'), true, 'RC to Mobile should remain available');
  assert.equal(cardGrid.includes('Mobile to RC'), false, 'Mobile to RC should not be rendered in the service card grid');
  assert.equal(source.includes('mobile-to-rc'), false, 'Mobile to RC should not remain an active vehicle transport route');
});

test('identity hub overview does not render the removed Mobile To PAN card', () => {
  const source = readSource('../components/identityHub/IdentityHubPage.tsx');
  const overviewStart = source.indexOf("if (activeTab === 'overview') {");
  const servicesStart = source.indexOf("\n  return (\n    <div className=\"space-y-6 animate-in fade-in duration-300\">", overviewStart);
  const overview = source.slice(overviewStart, servicesStart);

  assert.equal(overview.includes('Mobile To PAN'), false, 'Mobile To PAN should not be rendered in the overview cards');
});

test('unconfigured API prices are not rendered as placeholder text', () => {
  const source = readSource('../components/apiBilling/ApiBillingDisplay.tsx');

  assert.equal(source.includes('Price not configured'), false, 'unconfigured price placeholder should stay hidden');
});
