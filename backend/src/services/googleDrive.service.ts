import { google } from 'googleapis';
import { Readable } from 'stream';
import { getAppSettings } from '../utils/appSettings';
import { extractDriveFileIdFromSecureUrl } from '../utils/secureDocumentUrl';
import { getYearMonthFolderNames } from '../utils/driveFolderOrganization';
import { parseSingleByteRange } from '../utils/httpRange';
import { limitReadableToByteRange } from '../utils/mediaRangeStream';

const REDIRECT_URI = 'https://developers.google.com/oauthplayground';
const DRIVE_FOLDER_MIME_TYPE = 'application/vnd.google-apps.folder';
type DriveClient = ReturnType<typeof google.drive>;

export type DriveFileAccess = 'public' | 'private';

const getDriveClient = async () => {
  const settings = await getAppSettings();
  const { clientId, clientSecret, refreshToken } = settings.googleDrive;

  if (!clientId || !clientSecret || !refreshToken) {
    throw new Error('Google Drive credentials are not fully configured in settings.');
  }

  const oauth2Client = new google.auth.OAuth2(clientId, clientSecret, REDIRECT_URI);
  oauth2Client.setCredentials({ refresh_token: refreshToken });

  return google.drive({ version: 'v3', auth: oauth2Client });
};

const escapeDriveQueryValue = (value: string) => value.replace(/\\/g, '\\\\').replace(/'/g, "\\'");

const findOrCreateChildFolder = async (
  drive: DriveClient,
  name: string,
  parentFolderId: string,
): Promise<string> => {
  const response = await drive.files.list({
    q: `name = '${escapeDriveQueryValue(name)}' and '${escapeDriveQueryValue(parentFolderId)}' in parents and mimeType = '${DRIVE_FOLDER_MIME_TYPE}' and trashed = false`,
    pageSize: 1,
    orderBy: 'createdTime',
    fields: 'files(id,name,mimeType,trashed,capabilities(canAddChildren))',
    includeItemsFromAllDrives: true,
    supportsAllDrives: true,
  });

  const existingFolder = response.data.files?.find((folder) => folder.id);
  if (existingFolder?.id) {
    if (existingFolder.mimeType && existingFolder.mimeType !== DRIVE_FOLDER_MIME_TYPE) {
      throw new Error(`Google Drive folder "${name}" is invalid.`);
    }

    if (existingFolder.trashed || existingFolder.capabilities?.canAddChildren === false) {
      throw new Error(`Google Drive folder "${name}" is not writable.`);
    }

    return existingFolder.id;
  }

  const createdFolder = await drive.files.create({
    requestBody: {
      name,
      mimeType: DRIVE_FOLDER_MIME_TYPE,
      parents: [parentFolderId],
    },
    fields: 'id,name,mimeType,trashed,capabilities(canAddChildren)',
    supportsAllDrives: true,
  });

  const createdFolderId = createdFolder.data.id;
  if (!createdFolderId) {
    throw new Error(`Google Drive did not return an id for the "${name}" folder.`);
  }

  if (
    (createdFolder.data.mimeType && createdFolder.data.mimeType !== DRIVE_FOLDER_MIME_TYPE) ||
    createdFolder.data.trashed ||
    createdFolder.data.capabilities?.canAddChildren === false
  ) {
    throw new Error(`Google Drive created an invalid or unwritable "${name}" folder.`);
  }

  return createdFolderId;
};

export const resolveYearMonthUploadFolder = async (
  drive: DriveClient,
  rootFolderId: string,
  uploadDate: Date = new Date(),
): Promise<string> => {
  const { year, month } = getYearMonthFolderNames(uploadDate);
  const yearFolderId = await findOrCreateChildFolder(drive, year, rootFolderId);
  return findOrCreateChildFolder(drive, month, yearFolderId);
};

export const uploadFileToDrive = async (
  buffer: Buffer,
  mimeType: string,
  filename: string,
  folderId?: string,
  options: { access?: DriveFileAccess } = {},
): Promise<{ fileId: string; viewLink: string }> => {
  try {
    const drive = await getDriveClient();
    const settings = await getAppSettings();

    const fileMetadata: any = {
      name: filename,
    };

    const targetFolderId = folderId?.trim() || settings.googleDrive.backupFolderId?.trim();
    let uploadFolderId: string | undefined;
    if (targetFolderId) {
      const targetFolder = await drive.files.get({
        fileId: targetFolderId,
        fields: 'id,name,mimeType,trashed,capabilities(canAddChildren)',
        supportsAllDrives: true,
      });

      if (
        targetFolder.data.mimeType !== DRIVE_FOLDER_MIME_TYPE ||
        targetFolder.data.trashed ||
        targetFolder.data.capabilities?.canAddChildren !== true
      ) {
        throw new Error('Configured Google Drive upload folder is invalid or is not writable.');
      }

      uploadFolderId = await resolveYearMonthUploadFolder(drive, targetFolderId);
      fileMetadata.parents = [uploadFolderId];
    }

    const media = {
      mimeType,
      body: Readable.from(buffer),
    };

    const response = await drive.files.create({
      requestBody: fileMetadata,
      media: media,
      fields: 'id, parents, webViewLink, webContentLink',
      supportsAllDrives: true,
    });

    const fileId = response.data.id;
    if (!fileId) {
      throw new Error('Google Drive did not return a file id.');
    }

    if (uploadFolderId && !response.data.parents?.includes(uploadFolderId)) {
      throw new Error('Google Drive uploaded the file without the expected year/month parent folder.');
    }

    // Public assets are intentionally link-readable so they can be rendered by
    // browsers without exposing the backend. Secure documents never receive an
    // anyone permission and are served through an authorized backend stream.
    if (fileId && options.access !== 'private') {
      await drive.permissions.create({
        fileId: fileId,
        requestBody: {
          role: 'reader',
          type: 'anyone',
        },
        supportsAllDrives: true,
      });
    }

    return {
      fileId: fileId as string,
      viewLink: `https://drive.google.com/uc?id=${fileId}`,
    };
  } catch (error) {
    console.error('Error uploading file to Google Drive:', error instanceof Error ? error.message : error);
    throw new Error(error instanceof Error ? error.message : 'Failed to upload file to Google Drive');
  }
};

/**
 * Uploads a database backup dump file to Google Drive.
 *
 * Folder structure inside the configured backupFolderId:
 *   <backupFolderId>/
 *     backup-db/          ← auto-created if not present
 *       2026/             ← year folder (IST), auto-created if not present
 *         09-September/   ← month folder (IST), auto-created if not present
 *           db_dump_2026-09-25_000000.sql.gz
 *
 * After upload, enforces a rolling retention of maxBackups (default 30).
 * If total backup files inside backup-db exceed the limit, oldest files
 * are deleted one-by-one until the count is within the limit.
 *
 * Backup files are always private (no public Drive permission).
 */
export const uploadDatabaseBackupToDrive = async (
  buffer: Buffer,
  mimeType: string,
  filename: string,
  rootFolderId?: string,
  maxBackups: number = 30,
): Promise<{ fileId: string; viewLink: string; deletedCount: number }> => {
  const drive = await getDriveClient();
  const settings = await getAppSettings();
  const targetFolderId = rootFolderId?.trim() || settings.googleDrive.backupFolderId?.trim();

  if (!targetFolderId) {
    throw new Error(
      'Google Drive backup folder ID is not configured. Set it in Admin → Settings → Google Drive.',
    );
  }

  // Step 1: Verify the root backup folder is valid and writable
  const rootFolder = await drive.files.get({
    fileId: targetFolderId,
    fields: 'id,name,mimeType,trashed,capabilities(canAddChildren)',
    supportsAllDrives: true,
  });

  if (
    rootFolder.data.mimeType !== DRIVE_FOLDER_MIME_TYPE ||
    rootFolder.data.trashed ||
    rootFolder.data.capabilities?.canAddChildren !== true
  ) {
    throw new Error('Configured Google Drive backup root folder is invalid or not writable.');
  }

  // Step 2: Find or create 'backup-db' sub-folder inside root
  const backupDbFolderId = await findOrCreateChildFolder(drive, 'backup-db', targetFolderId);

  // Step 3: Find or create Year > Month folders inside backup-db (IST timezone)
  const yearMonthFolderId = await resolveYearMonthUploadFolder(drive, backupDbFolderId, new Date());

  // Step 4: Upload the dump file (always private — no public permission)
  const uploadResponse = await drive.files.create({
    requestBody: {
      name: filename,
      parents: [yearMonthFolderId],
    },
    media: {
      mimeType,
      body: Readable.from(buffer),
    },
    fields: 'id, webViewLink',
    supportsAllDrives: true,
  });

  const fileId = uploadResponse.data.id;
  if (!fileId) {
    throw new Error('Google Drive did not return a file id for the database backup.');
  }

  console.log(`[backup] Uploaded DB dump: ${filename} → Drive fileId=${fileId}`);

  // Step 5: Rolling 30-backup retention inside 'backup-db' folder tree
  // List all non-folder files anywhere inside backup-db (across year/month sub-folders)
  let deletedCount = 0;
  try {
    // Drive search: files whose ancestor is backupDbFolderId, ordered oldest first
    const listResponse = await drive.files.list({
      q: `'${escapeDriveQueryValue(backupDbFolderId)}' in ancestors and mimeType != '${DRIVE_FOLDER_MIME_TYPE}' and trashed = false`,
      orderBy: 'createdTime asc',
      pageSize: 100,
      fields: 'files(id, name, createdTime)',
      includeItemsFromAllDrives: true,
      supportsAllDrives: true,
    });

    const allBackupFiles = listResponse.data.files || [];
    const excessCount = allBackupFiles.length - maxBackups;

    if (excessCount > 0) {
      // Delete the oldest files to bring total back to maxBackups
      const filesToDelete = allBackupFiles.slice(0, excessCount);
      for (const fileToDelete of filesToDelete) {
        if (fileToDelete.id) {
          try {
            await drive.files.delete({ fileId: fileToDelete.id, supportsAllDrives: true });
            console.log(`[backup] Retention: deleted old backup "${fileToDelete.name}" (id=${fileToDelete.id})`);
            deletedCount++;
          } catch (deleteError) {
            // Log but don't abort — partial cleanup is better than full failure
            console.error(
              `[backup] Retention: failed to delete "${fileToDelete.name}":`,
              deleteError instanceof Error ? deleteError.message : deleteError,
            );
          }
        }
      }
    }
  } catch (retentionError) {
    // Retention failure must NOT fail the backup itself
    console.error(
      '[backup] Retention cleanup encountered an error (backup still succeeded):',
      retentionError instanceof Error ? retentionError.message : retentionError,
    );
  }

  return {
    fileId,
    viewLink: `https://drive.google.com/file/d/${fileId}/view`,
    deletedCount,
  };
};

export const deleteFileFromDrive = async (fileId: string): Promise<void> => {
  try {
    if (!fileId) return;
    const drive = await getDriveClient();
    await drive.files.delete({ fileId: fileId, supportsAllDrives: true });
    console.log(`Deleted file ${fileId} from Google Drive`);
  } catch (error) {
    console.error(`Error deleting file ${fileId} from Google Drive:`, error);
    // Do not throw error here, so we don't break the main flow if file deletion fails
  }
};

export const streamFileFromDrive = async (fileId: string): Promise<Readable> => {
  if (!fileId) {
    throw new Error('A Drive file id is required.');
  }

  const drive = await getDriveClient();
  const response = await drive.files.get(
    { fileId, alt: 'media', supportsAllDrives: true },
    { responseType: 'stream' },
  );

  return response.data as unknown as Readable;
};

export const streamDriveMediaWithHeaders = async (fileId: string, range?: string) => {
  if (!fileId) {
    throw new Error('A Drive file id is required.');
  }

  const drive = await getDriveClient();
  const metadataResponse = await drive.files.get({
    fileId,
    fields: 'mimeType,size',
    supportsAllDrives: true,
  });
  const response = await drive.files.get(
    { fileId, alt: 'media', supportsAllDrives: true },
    { responseType: 'stream' },
  );

  const totalSize = Number(metadataResponse.data.size);
  const knownTotalSize = Number.isSafeInteger(totalSize) && totalSize > 0 ? totalSize : null;
  const byteRange = range && knownTotalSize !== null
    ? parseSingleByteRange(range, knownTotalSize)
    : null;
  const stream = byteRange
    ? limitReadableToByteRange(response.data as unknown as Readable, byteRange.start, byteRange.end)
    : response.data as unknown as Readable;

  return {
    stream,
    totalSize: knownTotalSize,
    byteRange,
    headers: {
      ...response.headers,
      ...(metadataResponse.data.mimeType ? { 'content-type': metadataResponse.data.mimeType } : {}),
      ...(byteRange
        ? {
          'content-length': String(byteRange.length),
          'content-range': `bytes ${byteRange.start}-${byteRange.end}/${byteRange.total}`,
        }
        : metadataResponse.data.size
          ? { 'content-length': metadataResponse.data.size }
          : {}),
    },
  };
};

export const makeDriveFilePrivate = async (fileId: string): Promise<void> => {
  if (!fileId) return;

  const drive = await getDriveClient();
  const permissions = await drive.permissions.list({
    fileId,
    fields: 'permissions(id,type)',
    supportsAllDrives: true,
  });

  for (const permission of permissions.data.permissions || []) {
    if (permission.type === 'anyone' && permission.id) {
      await drive.permissions.delete({ fileId, permissionId: permission.id, supportsAllDrives: true });
    }
  }
};

export const extractDriveFileId = (url: string | null | undefined): string | null => {
  return extractDriveFileIdFromSecureUrl(url);
};
