import { mkdir, readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);
const BACKUP_TIMEOUT_MS = 30 * 60 * 1000;

const getISTTimestamp = (date: Date): string => {
  const formatter = new Intl.DateTimeFormat('en-IN', {
    timeZone: 'Asia/Kolkata',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });
  const parts = Object.fromEntries(
    formatter.formatToParts(date).map(({ type, value }) => [type, value]),
  );
  return `${parts.year}-${parts.month}-${parts.day}_${parts.hour}${parts.minute}${parts.second}`;
};

export const buildPartnerBackfillBackupFilename = (date: Date = new Date()) =>
  `partner-backfill-${getISTTimestamp(date)}.dump`;

export const buildPartnerBackfillBackupArgs = (databaseUrl: string, outputPath: string): string[] => [
  '--format=custom',
  '--no-owner',
  '--no-acl',
  `--file=${outputPath}`,
  `--dbname=${databaseUrl}`,
];

export const isValidPostgresCustomDump = (buffer: Buffer) =>
  buffer.subarray(0, 5).toString('ascii') === 'PGDMP';

const redactDatabaseUrl = (message: string, databaseUrl: string) => {
  try {
    const parsed = new URL(databaseUrl);
    if (parsed.password) parsed.password = 'REDACTED';
    return message.split(databaseUrl).join(parsed.toString());
  } catch {
    return message.split(databaseUrl).join('[REDACTED_DATABASE_URL]');
  }
};

export type PartnerBackfillBackup = {
  path: string;
  filename: string;
  sizeBytes: number;
  method: 'pg_dump';
};

export const createPartnerBackfillBackup = async (input: {
  databaseUrl?: string | null;
  backupDirectory: string;
  now?: Date;
  pgDumpPath?: string | null;
}): Promise<PartnerBackfillBackup> => {
  const databaseUrl = input.databaseUrl?.trim();
  if (!databaseUrl) throw new Error('DATABASE_URL is required before applying the partner backfill.');

  const backupDirectory = path.resolve(input.backupDirectory);
  await mkdir(backupDirectory, { recursive: true });
  const filename = buildPartnerBackfillBackupFilename(input.now);
  const outputPath = path.join(backupDirectory, filename);
  const command = input.pgDumpPath?.trim() || process.env.PG_DUMP_PATH?.trim() || 'pg_dump';

  try {
    await execFileAsync(command, buildPartnerBackfillBackupArgs(databaseUrl, outputPath), {
      timeout: BACKUP_TIMEOUT_MS,
      maxBuffer: 2 * 1024 * 1024,
      windowsHide: true,
    });
    const stats = await stat(outputPath);
    if (stats.size <= 0) throw new Error('pg_dump produced an empty backup.');
    const buffer = await readFile(outputPath);
    if (!isValidPostgresCustomDump(buffer)) throw new Error('pg_dump produced an invalid custom-format backup.');
    return { path: outputPath, filename, sizeBytes: stats.size, method: 'pg_dump' };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'pg_dump failed.';
    throw new Error(`Partner backfill backup failed: ${redactDatabaseUrl(message, databaseUrl)}`);
  }
};
