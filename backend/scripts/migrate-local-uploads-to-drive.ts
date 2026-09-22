import { promises as fs } from 'fs';
import path from 'path';
import prisma from '../src/lib/prisma';
import { uploadFileToDrive } from '../src/services/googleDrive.service';
import { getSecureDocumentUrl } from '../src/utils/secureDocumentUrl';
import { secureUploadDir, uploadRootDir } from '../src/utils/documentUpload';

const prismaAny = prisma as any;
const execute = process.argv.includes('--execute');

const stats = {
  scanned: 0,
  migrated: 0,
  missing: 0,
  skipped: 0,
};

const mimeTypeByExtension: Record<string, string> = {
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.mp4': 'video/mp4',
  '.webm': 'video/webm',
  '.mov': 'video/quicktime',
  '.pdf': 'application/pdf',
  '.doc': 'application/msword',
  '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
};

const isWithin = (candidatePath: string, parentPath: string) => {
  const candidate = path.resolve(candidatePath);
  const parent = `${path.resolve(parentPath)}${path.sep}`;
  return candidate === path.resolve(parentPath) || candidate.startsWith(parent);
};

const resolveLegacyLocalPath = (value: string) => {
  const trimmed = value.trim();
  if (!trimmed) return null;

  let pathname = trimmed;
  if (/^https?:\/\//i.test(trimmed)) {
    try {
      pathname = new URL(trimmed).pathname;
    } catch {
      return null;
    }
  }

  if (/^\/api\/documents\/secure\//i.test(pathname)) {
    const candidatePath = path.join(secureUploadDir, path.basename(pathname));
    return isWithin(candidatePath, secureUploadDir) ? { path: candidatePath, access: 'private' as const } : null;
  }

  if (/^\/uploads\//i.test(pathname)) {
    const relativePath = pathname.replace(/^\/uploads\//i, '');
    const candidatePath = path.join(uploadRootDir, relativePath);
    return isWithin(candidatePath, uploadRootDir) ? { path: candidatePath, access: 'public' as const } : null;
  }

  return null;
};

const migrateUrl = async (value: unknown) => {
  if (typeof value !== 'string') return value;

  const legacyFile = resolveLegacyLocalPath(value);
  if (!legacyFile) {
    stats.skipped += 1;
    return value;
  }

  stats.scanned += 1;
  try {
    await fs.access(legacyFile.path);
  } catch {
    stats.missing += 1;
    console.warn(`[missing] ${value} -> ${legacyFile.path}`);
    return value;
  }

  if (!execute) {
    console.log(`[dry-run] ${value} -> Drive (${legacyFile.access})`);
    return value;
  }

  const buffer = await fs.readFile(legacyFile.path);
  const extension = path.extname(legacyFile.path).toLowerCase();
  const mimeType = mimeTypeByExtension[extension] || 'application/octet-stream';
  const { fileId, viewLink } = await uploadFileToDrive(
    buffer,
    mimeType,
    path.basename(legacyFile.path),
    undefined,
    { access: legacyFile.access },
  );

  stats.migrated += 1;
  return legacyFile.access === 'private' ? getSecureDocumentUrl(fileId) : viewLink;
};

const migrateJsonValue = async (value: any): Promise<any> => {
  if (typeof value === 'string') return migrateUrl(value);
  if (Array.isArray(value)) return Promise.all(value.map((item) => migrateJsonValue(item)));
  if (!value || typeof value !== 'object') return value;

  const output: Record<string, unknown> = {};
  for (const [key, child] of Object.entries(value)) {
    output[key] = await migrateJsonValue(child);
  }
  return output;
};

const migrateTableField = async (modelName: string, fieldName: string) => {
  const model = prismaAny[modelName];
  if (!model) return;

  const rows = await model.findMany({ select: { id: true, [fieldName]: true } });
  for (const row of rows) {
    const currentValue = row[fieldName];
    const nextValue = await migrateUrl(currentValue);
    if (execute && nextValue !== currentValue) {
      await model.update({ where: { id: row.id }, data: { [fieldName]: nextValue } });
      console.log(`[updated] ${modelName}.${fieldName} ${row.id}`);
    }
  }
};

const migrateSettings = async () => {
  const settingsRecord = await prismaAny.platformRuntimeSettings.findUnique({
    where: { key: 'platform' },
    select: { payload: true },
  });

  if (!settingsRecord) return;

  const nextPayload = await migrateJsonValue(settingsRecord.payload);
  if (execute) {
    await prismaAny.platformRuntimeSettings.update({
      where: { key: 'platform' },
      data: { payload: nextPayload },
    });
    console.log('[updated] platform runtime settings');
  }
};

const main = async () => {
  console.log(execute ? 'Executing local upload migration to Google Drive.' : 'Dry-run only. Use --execute to update the database.');

  await migrateSettings();
  await migrateTableField('media', 'url');
  await migrateTableField('kycDocument', 'fileUrl');
  await migrateTableField('candidateDocument', 'fileUrl');
  await migrateTableField('listingPaymentSubmission', 'receiptUrl');
  await migrateTableField('customerPrimeSubscription', 'receiptUrl');

  console.log(JSON.stringify(stats, null, 2));
};

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
