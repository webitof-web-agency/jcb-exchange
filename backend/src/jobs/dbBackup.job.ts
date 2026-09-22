import cron from 'node-cron';
import { format } from 'fast-csv';
import { PassThrough } from 'stream';
import prisma from '../lib/prisma';
import { uploadFileToDrive } from '../services/googleDrive.service';
import { getAppSettings } from '../utils/appSettings';

export const startDatabaseBackupJob = () => {
  // Run daily at midnight: 0 0 * * *
  cron.schedule('0 0 * * *', async () => {
    console.log('[cron] Starting daily database backup to Google Drive...');
    try {
      const settings = await getAppSettings();
      const backupFolderId = settings.googleDrive.backupFolderId || undefined;

      // 1. Fetch tables
      const users = await prisma.user.findMany();
      const listings = await (prisma as any).listing.findMany();
      
      // 2. We'll backup Users as an example, but you can backup multiple
      // For simplicity in this job, let's create a combined or separate CSVs
      // We will do Users for now
      
      const csvStream = format({ headers: true });
      const passThrough = new PassThrough();
      
      csvStream.pipe(passThrough);
      
      // Push data
      users.forEach((user: any) => csvStream.write(user));
      csvStream.end();

      // Collect buffers
      const chunks: Buffer[] = [];
      passThrough.on('data', (chunk) => chunks.push(chunk));
      
      passThrough.on('end', async () => {
        const buffer = Buffer.concat(chunks);
        const filename = `db_backup_users_${new Date().toISOString().split('T')[0]}.csv`;
        
        try {
    const { viewLink } = await uploadFileToDrive(
      buffer,
      'text/csv',
      filename,
      backupFolderId,
      { access: 'private' },
    );
          console.log(`[cron] Successfully backed up database to: ${viewLink}`);
        } catch (uploadError) {
          console.error('[cron] Error uploading backup to Drive:', uploadError);
        }
      });

    } catch (error) {
      console.error('[cron] Failed to run database backup job:', error);
    }
  }, {
    timezone: "Asia/Kolkata"
  });
};
