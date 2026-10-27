import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const here = dirname(fileURLToPath(import.meta.url));
const readSource = (relativePath) => readFileSync(resolve(here, relativePath), 'utf8');

test('vehicle transport overview does not render removed service cards', () => {
  const source = readSource('../components/vehicleTransport/VehicleTransportPage.tsx');
  const gridStart = source.indexOf('{/* Service Cards Grid */}');
  const emptyStateStart = source.indexOf('{/* Empty State */}');
  const cardGrid = source.slice(gridStart, emptyStateStart);

  assert.equal(cardGrid.includes('RC Mobile Number Check'), false, 'RC Mobile Number Check should not be rendered in the service card grid');
  assert.equal(cardGrid.includes('RC Owner History'), true, 'RC Owner History should remain available');
  assert.equal(cardGrid.includes('RC to Mobile'), true, 'RC to Mobile should remain available');
  assert.equal(cardGrid.includes('Mobile to RC'), true, 'Mobile to RC should remain available');
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
