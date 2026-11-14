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
