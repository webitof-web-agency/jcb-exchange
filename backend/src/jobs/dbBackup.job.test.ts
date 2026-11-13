import assert from 'node:assert/strict';
import test from 'node:test';
import { buildPgDumpArgs, getDatabaseBackupRetention, getPgDumpCommand, redactDatabaseUrl } from './dbBackup.job';

test('redacts database passwords from backup error messages', () => {
  const databaseUrl = 'postgresql://backup_user:super-secret@db.example.com:5432/jcbexchange';
  const errorMessage = `Command failed: pg_dump "${databaseUrl}"`;

  const redacted = redactDatabaseUrl(errorMessage, databaseUrl);

  assert.equal(redacted.includes('super-secret'), false);
  assert.match(redacted, /backup_user:REDACTED@db\.example\.com/);
});

test('uses the configured pg_dump executable when one is provided', () => {
  assert.equal(getPgDumpCommand({ PG_DUMP_PATH: 'C:\\PostgreSQL\\bin\\pg_dump.exe' }), 'C:\\PostgreSQL\\bin\\pg_dump.exe');
  assert.equal(getPgDumpCommand({ PG_DUMP_PATH: '   ' }), 'pg_dump');
});

test('keeps daily backups indefinitely unless a retention limit is explicitly configured', () => {
  assert.equal(getDatabaseBackupRetention({}), null);
  assert.equal(getDatabaseBackupRetention({ DB_BACKUP_MAX_RETENTION: '0' }), null);
  assert.equal(getDatabaseBackupRetention({ DB_BACKUP_MAX_RETENTION: '365' }), 365);
});

test('builds a complete custom-format PostgreSQL dump command', () => {
  assert.deepEqual(
    buildPgDumpArgs('postgresql://backup_user:secret@db.example.com:5432/jcbexchange', 'C:\\tmp\\jcbexchange.dump'),
    [
      '--format=custom',
      '--blobs',
      '--no-owner',
      '--no-acl',
      '--file=C:\\tmp\\jcbexchange.dump',
      '--dbname=postgresql://backup_user:secret@db.example.com:5432/jcbexchange',
    ],
  );
});
