import app from './app';
import { startSoldListingRetentionJob } from './utils/soldListingRetention';
import { startKeepAlive } from './utils/keepAlive';
import { startDatabaseBackupJob } from './jobs/dbBackup.job';
import { migrateLegacyBrandingMediaToLocal } from './utils/legacyBrandingMigration';
import { storagePersistenceConfigured } from './utils/documentUpload';

const PORT = process.env.PORT || 5000;

startSoldListingRetentionJob();
startDatabaseBackupJob();

app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
  if (process.env.NODE_ENV === 'production' && !storagePersistenceConfigured) {
    console.warn('[storage] APP_STORAGE_DIR is not configured; runtime branding uploads will be lost on a fresh deployment.');
  }
  startKeepAlive(PORT);
  void migrateLegacyBrandingMediaToLocal().catch((error) => {
    console.error('Local branding restore failed:', error instanceof Error ? error.message : error);
  });
});
