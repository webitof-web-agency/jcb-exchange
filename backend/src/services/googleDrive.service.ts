import { google } from 'googleapis';
import { Readable } from 'stream';
import { getAppSettings } from '../utils/appSettings';

const REDIRECT_URI = 'https://developers.google.com/oauthplayground';

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
  folderId?: string
): Promise<{ fileId: string; viewLink: string }> => {
  try {
    const drive = await getDriveClient();

    const fileMetadata: any = {
      name: filename,
    };
    if (folderId) {
      fileMetadata.parents = [folderId];
    }

    const media = {
      mimeType,
      body: Readable.from(buffer),
    };

    const response = await drive.files.create({
      requestBody: fileMetadata,
      media: media,
      fields: 'id, webViewLink, webContentLink',
    });

    const fileId = response.data.id;
    
    // Set permission to anyone with link can view
    if (fileId) {
      await drive.permissions.create({
        fileId: fileId,
        requestBody: {
          role: 'reader',
          type: 'anyone',
        },
      });
    }

    return {
      fileId: fileId as string,
      viewLink: `https://drive.google.com/uc?id=${fileId}`,
    };
  } catch (error) {
    console.error('Error uploading file to Google Drive:', error);
    throw new Error('Failed to upload file to Google Drive');
  }
};

export const deleteFileFromDrive = async (fileId: string): Promise<void> => {
  try {
    if (!fileId) return;
    const drive = await getDriveClient();
    await drive.files.delete({ fileId: fileId });
    console.log(`Deleted file ${fileId} from Google Drive`);
  } catch (error) {
    console.error(`Error deleting file ${fileId} from Google Drive:`, error);
    // Do not throw error here, so we don't break the main flow if file deletion fails
  }
};

export const extractDriveFileId = (url: string | null | undefined): string | null => {
  if (!url) return null;
  // Example URL: https://drive.google.com/uc?id=1xyz...
  const match = url.match(/[?&]id=([^&]+)/);
  if (match && match[1]) {
    return match[1];
  }
  return null;
};
