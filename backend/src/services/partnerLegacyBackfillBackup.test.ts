import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildPartnerBackfillBackupFilename,
  buildPartnerBackfillBackupArgs,
  isValidPostgresCustomDump,
} from './partnerLegacyBackfillBackup';

test('builds a deterministic, non-secret backup filename', () => {
  assert.equal(
    buildPartnerBackfillBackupFilename(new Date('2026-11-05T12:34:56.000Z')),
    'partner-backfill-2026-11-05_180456.dump',
  );
});

test('passes the database URL only as a pg_dump argument and validates custom dumps', () => {
  const args = buildPartnerBackfillBackupArgs('postgresql://user:secret@localhost:5432/db', 'C:/tmp/backup.dump');
  assert.deepEqual(args, [
    '--format=custom',
    '--no-owner',
    '--no-acl',
    '--file=C:/tmp/backup.dump',
    '--dbname=postgresql://user:secret@localhost:5432/db',
  ]);
  assert.equal(isValidPostgresCustomDump(Buffer.from('PGDMPbackup')), true);
  assert.equal(isValidPostgresCustomDump(Buffer.from('not-a-dump')), false);
});
