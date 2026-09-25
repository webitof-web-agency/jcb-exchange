import cron from 'node-cron';
import zlib from 'zlib';
import { exec } from 'child_process';
import { promisify } from 'util';
import prisma from '../lib/prisma';
import { uploadDatabaseBackupToDrive } from '../services/googleDrive.service';
import { getAppSettings } from '../utils/appSettings';

const execAsync = promisify(exec);

const DB_BACKUP_MAX_RETENTION = 30;

/**
 * Builds an IST-based timestamp string: YYYY-MM-DD_HHMMSS
 */
const getISTTimestamp = (): string => {
  const now = new Date();
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
    formatter.formatToParts(now).map(({ type, value }) => [type, value]),
  );

  return `${parts.year}-${parts.month}-${parts.day}_${parts.hour}${parts.minute}${parts.second}`;
};

/**
 * Attempts a full PostgreSQL dump using pg_dump (native SQL format, gzip compressed).
 * Returns null if pg_dump is not available or fails.
 */
const tryPgDump = async (dbUrl: string): Promise<{ buffer: Buffer; filename: string; mimeType: string } | null> => {
  try {
    const { stdout, stderr } = await execAsync(
      `pg_dump --clean --if-exists --no-owner --no-acl "${dbUrl}"`,
      { maxBuffer: 100 * 1024 * 1024 }, // 100 MB max
    );

    if (stderr && !stderr.toLowerCase().includes('warning')) {
      console.warn('[backup] pg_dump produced stderr output:', stderr.slice(0, 500));
    }

    if (!stdout || stdout.trim().length === 0) {
      console.warn('[backup] pg_dump returned empty output, falling back to Prisma export.');
      return null;
    }

    const buffer = zlib.gzipSync(Buffer.from(stdout, 'utf-8'));
    const filename = `db_dump_${getISTTimestamp()}.sql.gz`;
    return { buffer, filename, mimeType: 'application/gzip' };
  } catch (error) {
    console.warn(
      '[backup] pg_dump not available or failed — falling back to Prisma full-data export.',
      error instanceof Error ? error.message : error,
    );
    return null;
  }
};

/**
 * Full Prisma data export fallback.
 * Exports all models to a structured JSON file, gzip compressed.
 */
const buildPrismaDataExport = async (): Promise<{ buffer: Buffer; filename: string; mimeType: string }> => {
  const prismaAny = prisma as any;

  // Collect all Prisma model keys (skip internal $... and _ keys)
  const modelKeys: string[] = Object.keys(prismaAny).filter(
    (key) =>
      !key.startsWith('_') &&
      !key.startsWith('$') &&
      typeof prismaAny[key]?.findMany === 'function',
  );

  const dumpData: Record<string, unknown> = {
    _meta: {
      timestamp: new Date().toISOString(),
      timezone: 'UTC',
      backupTool: 'prisma-data-export',
      version: '1.0',
      tables: modelKeys,
    },
  };

  for (const modelKey of modelKeys) {
    try {
      dumpData[modelKey] = await prismaAny[modelKey].findMany();
    } catch (err) {
      console.error(`[backup] Failed to export table "${modelKey}":`, err instanceof Error ? err.message : err);
      dumpData[modelKey] = null;
    }
  }

  const jsonBuffer = Buffer.from(JSON.stringify(dumpData, null, 2), 'utf-8');
  const buffer = zlib.gzipSync(jsonBuffer);
  const filename = `db_dump_${getISTTimestamp()}.json.gz`;

  return { buffer, filename, mimeType: 'application/gzip' };
};

/**
 * Runs a single database backup cycle:
 * 1. Tries pg_dump (native SQL), falls back to Prisma JSON export
 * 2. Uploads to Google Drive → backupFolderId/backup-db/YYYY/MM-Month/
 * 3. Enforces 30-file rolling retention (oldest deleted automatically)
 */
export const performDatabaseBackup = async (): Promise<{
  filename: string;
  fileId: string;
  viewLink: string;
  deletedCount: number;
  method: 'pg_dump' | 'prisma-export';
}> => {
  const settings = await getAppSettings();
  const backupFolderId = settings.googleDrive.backupFolderId?.trim() || undefined;

  if (!backupFolderId) {
    throw new Error(
      '[backup] Google Drive backupFolderId is not configured. Set it in Admin → Settings → Google Drive.',
    );
  }

  const dbUrl = process.env.DATABASE_URL?.trim();
  let dumpResult: { buffer: Buffer; filename: string; mimeType: string } | null = null;
  let method: 'pg_dump' | 'prisma-export' = 'prisma-export';

  // Prefer native pg_dump when DATABASE_URL is available
  if (dbUrl) {
    dumpResult = await tryPgDump(dbUrl);
    if (dumpResult) {
      method = 'pg_dump';
    }
  }

  // Fallback: full Prisma data export
  if (!dumpResult) {
    dumpResult = await buildPrismaDataExport();
    method = 'prisma-export';
  }

  const { buffer, filename, mimeType } = dumpResult;
  console.log(`[backup] Dump ready — method=${method}, file=${filename}, size=${(buffer.length / 1024).toFixed(1)} KB`);

  const { fileId, viewLink, deletedCount } = await uploadDatabaseBackupToDrive(
    buffer,
    mimeType,
    filename,
    backupFolderId,
    DB_BACKUP_MAX_RETENTION,
  );

  return { filename, fileId, viewLink, deletedCount, method };
};

/**
 * Registers the daily 12:00 AM IST cron job for automatic database backup.
 * Called once at server startup (server.ts).
 */
export const startDatabaseBackupJob = (): void => {
  // Cron: 0 0 * * * = every day at 00:00 (midnight)
  cron.schedule(
    '0 0 * * *',
    async () => {
      console.log('[cron] ⏰ Daily DB backup starting (12:00 AM IST)...');
      try {
        const result = await performDatabaseBackup();
        console.log(
          `[cron] ✅ DB backup complete — file="${result.filename}", method=${result.method}, ` +
          `driveId=${result.fileId}, oldBackupsDeleted=${result.deletedCount}`,
        );
      } catch (error) {
        console.error(
          '[cron] ❌ DB backup failed:',
          error instanceof Error ? error.message : error,
        );
      }
    },
    { timezone: 'Asia/Kolkata' },
  );

  console.log('[cron] 📅 Daily DB backup job registered — runs at 00:00 IST every day.');
};
