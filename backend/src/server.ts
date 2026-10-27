import app from './app';
import { startSoldListingRetentionJob } from './utils/soldListingRetention';
import { startKeepAlive } from './utils/keepAlive';
import { startDatabaseBackupJob } from './jobs/dbBackup.job';
import { startPanVerificationRetentionJob } from './jobs/panVerificationRetention.job';
import { startGstVerificationRetentionJob } from './jobs/gstVerificationRetention.job';
import { storagePersistenceConfigured } from './utils/documentUpload';
import { startFinanceHubWorker } from './modules/finance-hub';
import { startCrmWorker } from './modules/crm';

const PORT = process.env.PORT || 5000;

startSoldListingRetentionJob();
startDatabaseBackupJob();
startPanVerificationRetentionJob();
startGstVerificationRetentionJob();
// Finance Hub automatic posting; idle while posting mode is OFF.
startFinanceHubWorker();
// CRM follow-up reminders, missed marking, SLA and (opt-in) automation.
startCrmWorker();

app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
  if (process.env.NODE_ENV === 'production' && !storagePersistenceConfigured) {
    console.warn('[storage] APP_STORAGE_DIR is not configured; local branding, secure, or legacy uploads will be lost on a fresh deployment.');
  }
  startKeepAlive(PORT);
});
