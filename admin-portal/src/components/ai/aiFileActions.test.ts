import { test } from 'node:test';
import assert from 'node:assert/strict';
import { getAiFileRequestPath } from './aiFileActionModel';

test('normalizes internal API file actions to the axios request path', () => {
  assert.equal(getAiFileRequestPath('/api/documents/secure/drive-abc.pdf'), '/documents/secure/drive-abc.pdf');
  assert.equal(getAiFileRequestPath('/api/recruitment/admin/sell-accounts/123/invoice'), '/recruitment/admin/sell-accounts/123/invoice');
});

test('accepts every generated sale and RTO document action returned by the AI', () => {
  const routes = [
    '/api/recruitment/admin/sell-accounts/32e28d69-5b6e-41b8-a1dd-850528f6ad09/payments/42e28d69-5b6e-41b8-a1dd-850528f6ad09/receipt',
    '/api/recruitment/admin/sell-accounts/32e28d69-5b6e-41b8-a1dd-850528f6ad09/credit-note',
    '/api/recruitment/admin/sell-accounts/32e28d69-5b6e-41b8-a1dd-850528f6ad09/refunds/52e28d69-5b6e-41b8-a1dd-850528f6ad09/advice',
    '/api/recruitment/admin/sell-accounts/32e28d69-5b6e-41b8-a1dd-850528f6ad09/delivery-challan',
    '/api/recruitment/admin/rto-records/62e28d69-5b6e-41b8-a1dd-850528f6ad09/transfer-certificate',
  ];
  for (const route of routes) assert.ok(getAiFileRequestPath(route), route);
});

test('rejects non-internal or malformed file action URLs', () => {
  assert.equal(getAiFileRequestPath('https://example.com/file.pdf'), null);
  assert.equal(getAiFileRequestPath('/api/documents/secure/../../secret'), null);
  assert.equal(getAiFileRequestPath('/documents/secure/drive-abc.pdf'), null);
});

test('accepts internal vehicle-doc and verification template actions', () => {
  assert.equal(getAiFileRequestPath('/api/vehicle-docs/CG04NF0268/details.pdf?inline=1'), '/vehicle-docs/CG04NF0268/details.pdf?inline=1');
  assert.equal(getAiFileRequestPath('/api/vehicle-docs/CG04NF0268/files/rto-task-123-proof-1'), '/vehicle-docs/CG04NF0268/files/rto-task-123-proof-1');
  assert.equal(getAiFileRequestPath('/api/vehicle-docs/CG04NF0268/zip'), '/vehicle-docs/CG04NF0268/zip');
  assert.equal(getAiFileRequestPath('/api/pan-verification/32e28d69-5b6e-41b8-a1dd-850528f6ad09/template'), '/pan-verification/32e28d69-5b6e-41b8-a1dd-850528f6ad09/template');
});

test('accepts Finance Hub payroll and tax exports returned by the assistant', () => {
  assert.equal(
    getAiFileRequestPath('/api/finance-hub/payroll/runs/32e28d69-5b6e-41b8-a1dd-850528f6ad09/payslips.csv'),
    '/finance-hub/payroll/runs/32e28d69-5b6e-41b8-a1dd-850528f6ad09/payslips.csv',
  );
  assert.equal(
    getAiFileRequestPath('/api/finance-hub/payroll/statutory.csv?month=2026-11'),
    '/finance-hub/payroll/statutory.csv?month=2026-11',
  );
  assert.equal(
    getAiFileRequestPath('/api/finance-hub/tax/export/gst-summary?month=2026-11'),
    '/finance-hub/tax/export/gst-summary?month=2026-11',
  );
  assert.equal(
    getAiFileRequestPath('/api/finance-hub/data/export/tally?from=2026-04-01&to=2026-11-17'),
    '/finance-hub/data/export/tally?from=2026-04-01&to=2026-11-17',
  );
});

test('accepts the authenticated Analytics listings export', () => {
  assert.equal(getAiFileRequestPath('/api/analytics/export/listings.csv'), '/analytics/export/listings.csv');
  assert.equal(getAiFileRequestPath('/api/analytics/export/users.csv'), null);
});
