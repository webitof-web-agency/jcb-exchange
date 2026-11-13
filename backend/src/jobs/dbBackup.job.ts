import cron from 'node-cron';
import { mkdtemp, readFile, rm, stat } from 'fs/promises';
import os from 'os';
import path from 'path';
import { execFile } from 'child_process';
import { promisify } from 'util';
import { uploadDatabaseBackupToDrive } from '../services/googleDrive.service';
import {
  getAppSettings,
  recordDatabaseBackupFailure,
  recordDatabaseBackupSuccess,
} from '../utils/appSettings';

const execFileAsync = promisify(execFile);
const PG_DUMP_TIMEOUT_MS = 30 * 60 * 1000;

export class DatabaseBackupInProgressError extends Error {
  readonly code = 'DATABASE_BACKUP_IN_PROGRESS';

  constructor() {
    super('A database backup is already running. Please wait for it to finish.');
    this.name = 'DatabaseBackupInProgressError';
  }
}

/**
 * Builds an IST-based timestamp string: YYYY-MM-DD_HHMMSS.
 */
const getISTTimestamp = (date: Date = new Date()): string => {
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

export const getISTDateKey = (date: Date = new Date()): string => getISTTimestamp(date).slice(0, 10);

/** Backups stay forever unless an explicit positive limit is configured. */
export const getDatabaseBackupRetention = (env: NodeJS.ProcessEnv = process.env): number | null => {
  const raw = env.DB_BACKUP_MAX_RETENTION?.trim();
  if (!raw) return null;
  const value = Number.parseInt(raw, 10);
  return Number.isInteger(value) && value > 0 ? value : null;
};

export const redactDatabaseUrl = (message: string, dbUrl: string): string => {
  try {
    const parsed = new URL(dbUrl);
    if (parsed.password) parsed.password = 'REDACTED';
    return message.split(dbUrl).join(parsed.toString());
  } catch {
    return message.split(dbUrl).join('[REDACTED_DATABASE_URL]');
  }
};

export const getPgDumpCommand = (env: NodeJS.ProcessEnv = process.env): string =>
  env.PG_DUMP_PATH?.trim() || 'pg_dump';

export const buildPgDumpArgs = (dbUrl: string, outputPath: string): string[] => [
  '--format=custom',
  '--blobs',
  '--no-owner',
  '--no-acl',
  `--file=${outputPath}`,
  `--dbname=${dbUrl}`,
];

const isValidCustomDump = (buffer: Buffer): boolean =>
  buffer.subarray(0, 5).toString('ascii') === 'PGDMP';

/**
 * Creates a complete PostgreSQL custom-format archive from the live database.
 * pg_dump reads the live catalog, so tables added by future migrations are
 * included automatically without changing this code.
 */
const createPgDump = async (dbUrl: string, backupDate: Date): Promise<{
  buffer: Buffer;
  filename: string;
  mimeType: string;
}> => {
  const temporaryDirectory = await mkdtemp(path.join(os.tmpdir(), 'jcbexchange-db-backup-'));
  const temporaryDumpPath = path.join(temporaryDirectory, 'database.dump');
  const command = getPgDumpCommand();

  try {
    const result = await execFileAsync(
      command,
      buildPgDumpArgs(dbUrl, temporaryDumpPath),
      {
        timeout: PG_DUMP_TIMEOUT_MS,
        maxBuffer: 2 * 1024 * 1024,
        windowsHide: true,
      },
    );

    if (result.stderr?.trim()) {
      console.warn('[backup] pg_dump stderr:', redactDatabaseUrl(result.stderr.trim().slice(0, 1000), dbUrl));
    }

    const dumpStats = await stat(temporaryDumpPath);
    if (dumpStats.size <= 0) {
      throw new Error('pg_dump completed but produced an empty archive.');
    }

    const buffer = await readFile(temporaryDumpPath);
    if (!isValidCustomDump(buffer)) {
      throw new Error('pg_dump produced an invalid custom-format archive.');
    }

    return {
      buffer,
      filename: `db_dump_${getISTTimestamp(backupDate)}.dump`,
      mimeType: 'application/octet-stream',
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'pg_dump failed.';
    throw new Error(
      `[backup] Complete PostgreSQL backup failed: ${redactDatabaseUrl(message, dbUrl)} ` +
      `Configure PG_DUMP_PATH or make pg_dump available on PATH.`,
    );
  } finally {
    await rm(temporaryDirectory, { recursive: true, force: true });
  }
};

type DatabaseBackupResult = {
  filename: string;
  fileId: string;
  viewLink: string;
  deletedCount: number;
  sizeBytes: number;
  method: 'pg_dump';
};

let activeBackupPromise: Promise<DatabaseBackupResult> | null = null;

const performDatabaseBackupCycle = async (): Promise<DatabaseBackupResult> => {
  const backupDate = new Date();
  try {
    const settings = await getAppSettings();
  const backupFolderId = settings.googleDrive.backupFolderId?.trim() || undefined;
  const dbUrl = process.env.DATABASE_URL?.trim();

  if (!backupFolderId) {
    throw new Error(
      '[backup] Google Drive backupFolderId is not configured. Set it in Admin → Settings → Google Drive.',
    );
  }

  if (!dbUrl) {
    throw new Error('[backup] DATABASE_URL is not configured; a complete database backup cannot run.');
  }

  const { buffer, filename, mimeType } = await createPgDump(dbUrl, backupDate);
  console.log(`[backup] Complete pg_dump ready — file=${filename}, size=${(buffer.length / 1024).toFixed(1)} KB`);

  const { fileId, viewLink, deletedCount, sizeBytes } = await uploadDatabaseBackupToDrive(
    buffer,
    mimeType,
    filename,
    backupFolderId,
    getDatabaseBackupRetention(),
    backupDate,
  );

  await recordDatabaseBackupSuccess({ attemptedAt: backupDate, filename, fileId, sizeBytes });
  return { filename, fileId, viewLink, deletedCount, sizeBytes, method: 'pg_dump' };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Database backup failed.';
    try {
      await recordDatabaseBackupFailure({
        attemptedAt: backupDate,
        message: redactDatabaseUrl(message, process.env.DATABASE_URL?.trim() || ''),
      });
    } catch (stateError) {
      console.error('[backup] Could not persist backup failure status:', stateError instanceof Error ? stateError.message : stateError);
    }
    throw error;
  }
};

/**
 * Runs one complete database backup. Automatic and manual triggers share this
 * lock so two large dumps cannot run at the same time.
 */
export const performDatabaseBackup = (): Promise<DatabaseBackupResult> => {
  if (activeBackupPromise) {
    throw new DatabaseBackupInProgressError();
  }

  const backupPromise = performDatabaseBackupCycle();
  const trackedPromise = backupPromise.finally(() => {
    if (activeBackupPromise === trackedPromise) {
      activeBackupPromise = null;
    }
  });
  activeBackupPromise = trackedPromise;
  return trackedPromise;
};

const runStartupCatchUpIfNeeded = async (): Promise<void> => {
  const settings = await getAppSettings();
  const lastSuccessAt = settings.databaseBackup.lastSuccessAt;
  if (lastSuccessAt && getISTDateKey(new Date(lastSuccessAt)) === getISTDateKey()) {
    console.log(`[backup] Startup check: today's backup already completed at ${lastSuccessAt}.`);
    return;
  }

  console.log('[backup] Startup check found no successful backup for today; running catch-up backup.');
  try {
    await performDatabaseBackup();
  } catch (error) {
    console.error('[backup] Startup catch-up backup failed:', error instanceof Error ? error.message : error);
  }
};

/**
 * Registers the daily 12:00 AM IST cron job for automatic database backup.
 * Called once at server startup (server.ts).
 */
export const startDatabaseBackupJob = (): void => {
  cron.schedule(
    '0 0 * * *',
    async () => {
      console.log('[cron] ⏰ Daily complete DB backup starting (12:00 AM IST)...');
      try {
        const result = await performDatabaseBackup();
        console.log(
          `[cron] ✅ DB backup complete — file="${result.filename}", method=${result.method}, ` +
          `driveId=${result.fileId}, oldBackupsDeleted=${result.deletedCount}`,
        );
      } catch (error) {
        console.error(
          '[cron] ❌ Complete DB backup failed:',
          error instanceof Error ? error.message : error,
        );
      }
    },
    { timezone: 'Asia/Kolkata' },
  );

  // A deploy/restart or a sleeping instance can miss the exact midnight tick.
  // The durable success timestamp makes the next healthy startup catch up once.
  setTimeout(() => {
    void runStartupCatchUpIfNeeded().catch((error) => {
      console.error('[backup] Startup backup check failed:', error instanceof Error ? error.message : error);
    });
  }, 10_000);

  console.log('[cron] 📅 Daily complete DB backup job registered — runs at 00:00 IST every day.');
};
