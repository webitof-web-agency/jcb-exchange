import app from './app';
import { startSoldListingRetentionJob } from './utils/soldListingRetention';
import { startKeepAlive } from './utils/keepAlive';
import { startDatabaseBackupJob } from './jobs/dbBackup.job';
import { migrateLegacyBrandingMediaToLocal } from './utils/legacyBrandingMigration';

const PORT = process.env.PORT || 5000;

startSoldListingRetentionJob();
startDatabaseBackupJob();

app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
  startKeepAlive(PORT);
  void migrateLegacyBrandingMediaToLocal().catch((error) => {
    console.error('Legacy branding migration failed:', error instanceof Error ? error.message : error);
  });
});
