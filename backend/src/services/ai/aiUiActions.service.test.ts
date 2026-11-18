import assert from 'node:assert/strict';
import test from 'node:test';
import { buildAiFileAction } from './aiUiActions.service';

test('builds a preview and download action for an authenticated secure document route', () => {
  const action = buildAiFileAction({
    label: 'Resume',
    fileName: 'candidate-resume.pdf',
    mimeType: 'application/pdf',
    url: '/api/documents/secure/drive-private-file-123',
  });

  assert.deepEqual(action, {
    type: 'FILE',
    label: 'Resume',
    fileName: 'candidate-resume.pdf',
    mimeType: 'application/pdf',
    url: '/api/documents/secure/drive-private-file-123',
    previewable: true,
    downloadable: true,
  });
});

test('builds a generated invoice action only for the allow-listed internal route', () => {
  const action = buildAiFileAction({
    label: 'Invoice',
    fileName: 'invoice.pdf',
    mimeType: 'application/pdf',
    url: '/api/recruitment/admin/sell-accounts/32e28d69-5b6e-41b8-a1dd-850528f6ad09/invoice',
  });

  assert.equal(action?.previewable, true);
  assert.equal(action?.downloadable, true);
});

test('builds all Sold Vehicle document actions only for exact authenticated internal routes', () => {
  const routes = [
    '/api/recruitment/admin/sell-accounts/32e28d69-5b6e-41b8-a1dd-850528f6ad09/payments/42e28d69-5b6e-41b8-a1dd-850528f6ad09/receipt',
    '/api/recruitment/admin/sell-accounts/32e28d69-5b6e-41b8-a1dd-850528f6ad09/credit-note',
    '/api/recruitment/admin/sell-accounts/32e28d69-5b6e-41b8-a1dd-850528f6ad09/refunds/52e28d69-5b6e-41b8-a1dd-850528f6ad09/advice',
    '/api/recruitment/admin/sell-accounts/32e28d69-5b6e-41b8-a1dd-850528f6ad09/delivery-challan',
    '/api/recruitment/admin/rto-records/62e28d69-5b6e-41b8-a1dd-850528f6ad09/transfer-certificate',
  ];
  routes.forEach((url) => assert.equal(buildAiFileAction({ label: 'Sold Vehicle file', fileName: 'file.pdf', mimeType: 'application/pdf', url })?.downloadable, true));
});

test('builds vehicle document preview and download actions only for internal vehicle-doc routes', () => {
  const details = buildAiFileAction({
    label: 'Vehicle details',
    fileName: 'CG04NF0268 - Vehicle Details.pdf',
    mimeType: 'application/pdf',
    url: '/api/vehicle-docs/CG04NF0268/details.pdf?inline=1',
  });
  const file = buildAiFileAction({
    label: 'RC proof',
    fileName: 'RC proof.pdf',
    mimeType: 'application/pdf',
    url: '/api/vehicle-docs/CG04NF0268/files/rto-task-123-proof-1',
  });
  const archive = buildAiFileAction({
    label: 'All vehicle documents',
    fileName: 'CG04NF0268 - Vehicle Documents.zip',
    mimeType: 'application/zip',
    url: '/api/vehicle-docs/CG04NF0268/zip',
  });

  assert.equal(details?.previewable, true);
  assert.equal(details?.downloadable, true);
  assert.equal(file?.previewable, true);
  assert.equal(file?.downloadable, true);
  assert.equal(archive?.previewable, false);
  assert.equal(archive?.downloadable, true);
});

test('builds verification template actions only for internal verification routes', () => {
  const action = buildAiFileAction({
    label: 'PAN verification template',
    fileName: 'PAN-verification.pdf',
    mimeType: 'application/pdf',
    url: '/api/pan-verification/32e28d69-5b6e-41b8-a1dd-850528f6ad09/template',
  });

  assert.equal(action?.previewable, true);
  assert.equal(action?.downloadable, true);
});

test('builds Payroll CSV actions only for authenticated internal export routes', () => {
  const payslips = buildAiFileAction({
    label: 'Payslips',
    fileName: 'payslips-2026-11.csv',
    mimeType: 'text/csv',
    url: '/api/finance-hub/payroll/runs/32e28d69-5b6e-41b8-a1dd-850528f6ad09/payslips.csv',
  });
  const statutory = buildAiFileAction({
    label: 'Statutory contributions',
    fileName: 'statutory-2026-11.csv',
    mimeType: 'text/csv',
    url: '/api/finance-hub/payroll/statutory.csv?month=2026-11',
  });
  assert.equal(payslips?.previewable, false);
  assert.equal(payslips?.downloadable, true);
  assert.equal(statutory?.previewable, false);
  assert.equal(statutory?.downloadable, true);
  assert.equal(buildAiFileAction({ label: 'File', fileName: 'file.csv', mimeType: 'text/csv', url: '/api/finance-hub/payroll/runs/not-a-run/payslips.csv' }), null);
});

test('builds Taxation CSV actions only for internal tax export routes', () => {
  const action = buildAiFileAction({
    label: 'GST summary',
    fileName: 'gst-summary.csv',
    mimeType: 'text/csv',
    url: '/api/finance-hub/tax/export/gst-summary?month=2026-11',
  });
  assert.equal(action?.previewable, false);
  assert.equal(action?.downloadable, true);
  assert.equal(buildAiFileAction({ label: 'File', fileName: 'file.csv', mimeType: 'text/csv', url: '/api/finance-hub/tax/export/unknown?month=2026-11' }), null);
});

test('builds accounting export actions only for allow-listed Finance Hub export routes', () => {
  const tally = buildAiFileAction({
    label: 'Tally export',
    fileName: 'tally-export.xml',
    mimeType: 'application/xml',
    url: '/api/finance-hub/data/export/tally?from=2026-04-01&to=2026-11-17',
  });
  const trialBalance = buildAiFileAction({
    label: 'Trial balance',
    fileName: 'trial-balance.csv',
    mimeType: 'text/csv',
    url: '/api/finance-hub/data/export/trial-balance',
  });

  assert.equal(tally?.downloadable, true);
  assert.equal(trialBalance?.downloadable, true);
  assert.equal(buildAiFileAction({ label: 'File', fileName: 'file.csv', mimeType: 'text/csv', url: '/api/finance-hub/data/export/users' }), null);
});

test('rejects external, javascript, and unscoped file URLs', () => {
  for (const url of [
    'https://evil.example/file.pdf',
    'javascript:alert(1)',
    '/uploads/private/file.pdf',
    '/api/documents/upload/public/drive-public-file',
  ]) {
    assert.equal(buildAiFileAction({ label: 'File', fileName: 'file.pdf', mimeType: 'application/pdf', url }), null);
  }
});

test('builds Analytics CSV export actions only for the internal listings export route', () => {
  const action = buildAiFileAction({
    label: 'Analytics listings export',
    fileName: 'analytics-listings.csv',
    mimeType: 'text/csv',
    url: '/api/analytics/export/listings.csv',
  });
  assert.equal(action?.downloadable, true);
  assert.equal(buildAiFileAction({ label: 'File', fileName: 'file.csv', mimeType: 'text/csv', url: '/api/analytics/export/users.csv' }), null);
});
