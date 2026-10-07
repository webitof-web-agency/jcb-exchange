import assert from 'node:assert/strict';
import test from 'node:test';
import { redactDatabaseUrl } from './dbBackup.job';

test('redacts database passwords from backup error messages', () => {
  const databaseUrl = 'postgresql://backup_user:super-secret@db.example.com:5432/jcbexchange';
  const errorMessage = `Command failed: pg_dump "${databaseUrl}"`;

  const redacted = redactDatabaseUrl(errorMessage, databaseUrl);

  assert.equal(redacted.includes('super-secret'), false);
  assert.match(redacted, /backup_user:REDACTED@db\.example\.com/);
});
