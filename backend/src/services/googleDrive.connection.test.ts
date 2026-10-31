import assert from 'node:assert/strict';
import test from 'node:test';
import { inspectGoogleDriveConnection } from './googleDrive.service';

test('inspects the Drive account and configured backup folder without writing data', async () => {
  const calls: string[] = [];
  const drive = {
    about: {
      get: async () => {
        calls.push('about.get');
        return { data: { user: { displayName: 'JCB Exchange', emailAddress: 'drive@example.com' } } };
      },
    },
    files: {
      get: async () => {
        calls.push('files.get');
        return {
          data: {
            id: 'folder-id',
            name: 'Uploads',
            mimeType: 'application/vnd.google-apps.folder',
            trashed: false,
            capabilities: { canAddChildren: true },
          },
        };
      },
      list: async () => {
        calls.push('files.list');
        return { data: { files: [] } };
      },
    },
  };

  const result = await inspectGoogleDriveConnection(drive as never, 'folder-id');

  assert.deepEqual(result, {
    account: { name: 'JCB Exchange', email: 'drive@example.com' },
    backupFolder: {
      configured: true,
      idPresent: true,
      name: 'Uploads',
      writable: true,
    },
  });
  assert.deepEqual(calls, ['about.get', 'files.get']);
});

test('checks Drive access without a folder by listing readable files', async () => {
  const calls: string[] = [];
  const drive = {
    about: { get: async () => ({ data: { user: {} } }) },
    files: {
      get: async () => {
        calls.push('files.get');
        return { data: {} };
      },
      list: async () => {
        calls.push('files.list');
        return { data: { files: [] } };
      },
    },
  };

  const result = await inspectGoogleDriveConnection(drive as never, null);

  assert.deepEqual(result.backupFolder, {
    configured: false,
    idPresent: false,
    name: null,
    writable: null,
  });
  assert.deepEqual(calls, ['files.list']);
});
