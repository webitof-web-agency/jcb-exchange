import assert from 'node:assert/strict';
import test from 'node:test';
import { listBackupFilesRecursively, resolveYearMonthUploadFolder } from './googleDrive.service';

test('reuses the existing year and month folders under the configured root', async () => {
  const listCalls: Array<Record<string, unknown>> = [];
  const drive = {
    files: {
      list: async (params: Record<string, unknown>) => {
        listCalls.push(params);
        return {
          data: {
            files: [{ id: listCalls.length === 1 ? 'year-folder-id' : 'month-folder-id' }],
          },
        };
      },
      create: async () => {
        throw new Error('create should not be called when folders already exist');
      },
    },
  } as never;

  const folderId = await resolveYearMonthUploadFolder(
    drive,
    'root-folder-id',
    new Date('2026-09-24T12:00:00.000Z'),
  );

  assert.equal(folderId, 'month-folder-id');
  assert.equal(listCalls.length, 2);
  assert.match(String(listCalls[0]!.q), /2026/);
  assert.match(String(listCalls[1]!.q), /09-September/);
});

test('creates missing year and month folders below the configured root', async () => {
  const createCalls: Array<Record<string, unknown>> = [];
  const drive = {
    files: {
      list: async () => ({ data: { files: [] } }),
      create: async (params: Record<string, unknown>) => {
        createCalls.push(params);
        return {
          data: {
            id: createCalls.length === 1 ? 'created-year-id' : 'created-month-id',
          },
        };
      },
    },
  } as never;

  const folderId = await resolveYearMonthUploadFolder(
    drive,
    'root-folder-id',
    new Date('2026-09-24T12:00:00.000Z'),
  );

  assert.equal(folderId, 'created-month-id');
  assert.deepEqual(createCalls.map((call) => call.requestBody), [
    { name: '2026', mimeType: 'application/vnd.google-apps.folder', parents: ['root-folder-id'] },
    { name: '09-September', mimeType: 'application/vnd.google-apps.folder', parents: ['created-year-id'] },
  ]);
});

test('lists backup files recursively without using the unsupported ancestors query', async () => {
  const queries: string[] = [];
  const drive = {
    files: {
      list: async (params: Record<string, unknown>) => {
        const query = String(params.q);
        queries.push(query);
        if (query.includes("'backup-root' in parents")) {
          return { data: { files: [{ id: 'year-folder', mimeType: 'application/vnd.google-apps.folder' }] } };
        }
        if (query.includes("'year-folder' in parents")) {
          return { data: { files: [{ id: 'month-folder', mimeType: 'application/vnd.google-apps.folder' }] } };
        }
        return {
          data: {
            files: [
              { id: 'new-backup', name: 'new.json.gz', mimeType: 'application/gzip', createdTime: '2026-10-07T00:00:00.000Z' },
              { id: 'old-backup', name: 'old.json.gz', mimeType: 'application/gzip', createdTime: '2026-10-01T00:00:00.000Z' },
            ],
          },
        };
      },
    },
  } as never;

  const files = await listBackupFilesRecursively(drive, 'backup-root');

  assert.deepEqual(files.map((file) => file.id), ['old-backup', 'new-backup']);
  assert.equal(queries.some((query) => query.includes('ancestors')), false);
});
