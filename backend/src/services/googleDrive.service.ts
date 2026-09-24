import { google } from 'googleapis';
import { Readable } from 'stream';
import { getAppSettings } from '../utils/appSettings';
import { extractDriveFileIdFromSecureUrl } from '../utils/secureDocumentUrl';

const REDIRECT_URI = 'https://developers.google.com/oauthplayground';

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
    if (targetFolderId) {
      const targetFolder = await drive.files.get({
        fileId: targetFolderId,
        fields: 'id,name,mimeType,trashed,capabilities(canAddChildren)',
        supportsAllDrives: true,
      });

      if (
        targetFolder.data.mimeType !== 'application/vnd.google-apps.folder' ||
        targetFolder.data.trashed ||
        targetFolder.data.capabilities?.canAddChildren !== true
      ) {
        throw new Error('Configured Google Drive upload folder is invalid or is not writable.');
      }

      fileMetadata.parents = [targetFolderId];
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

    if (targetFolderId && !response.data.parents?.includes(targetFolderId)) {
      throw new Error('Google Drive uploaded the file without the configured parent folder.');
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
    {
      responseType: 'stream',
      ...(range ? { headers: { Range: range } } : {}),
    },
  );

  return {
    stream: response.data as unknown as Readable,
    headers: {
      ...response.headers,
      ...(metadataResponse.data.mimeType ? { 'content-type': metadataResponse.data.mimeType } : {}),
      ...(metadataResponse.data.size ? { 'content-length': metadataResponse.data.size } : {}),
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
