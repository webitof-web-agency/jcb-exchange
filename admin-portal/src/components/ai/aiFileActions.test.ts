import { test } from 'node:test';
import assert from 'node:assert/strict';
import { getAiFileRequestPath } from './aiFileActionModel';

test('normalizes internal API file actions to the axios request path', () => {
  assert.equal(getAiFileRequestPath('/api/documents/secure/drive-abc.pdf'), '/documents/secure/drive-abc.pdf');
  assert.equal(getAiFileRequestPath('/api/recruitment/admin/sell-accounts/123/invoice'), '/recruitment/admin/sell-accounts/123/invoice');
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
