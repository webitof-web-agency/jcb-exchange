import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildSellAccountListUrl,
  isHighlightedSellAccount,
} from './sellAccountListNavigation.mjs';

test('builds a role-preserving Sold Vehicles list URL with a highlight target', () => {
  assert.equal(
    buildSellAccountListUrl('/employee/accounts/sell-accounts', 'SA-2026-002'),
    '/employee/accounts/sell-accounts?highlightId=SA-2026-002',
  );
});

test('matches a highlighted Sold Vehicle by its stable id or record number', () => {
  assert.equal(
    isHighlightedSellAccount({ id: 'vehicle-uuid-1', recordNumber: 'SA-2026-002' }, 'SA-2026-002'),
    true,
  );
  assert.equal(
    isHighlightedSellAccount({ id: 'vehicle-uuid-1', recordNumber: 'SA-2026-002' }, 'vehicle-uuid-1'),
    true,
  );
  assert.equal(
    isHighlightedSellAccount({ id: 'vehicle-uuid-1', recordNumber: 'SA-2026-002' }, 'SA-2026-003'),
    false,
  );
});
