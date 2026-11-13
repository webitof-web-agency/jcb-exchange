// Must stay the first import: error monitoring has to be ready before the app loads.
import './instrument';
import app from './app';
import { startSoldListingRetentionJob } from './utils/soldListingRetention';
import { startKeepAlive } from './utils/keepAlive';
import { startDatabaseBackupJob } from './jobs/dbBackup.job';
import { startPanVerificationRetentionJob } from './jobs/panVerificationRetention.job';
import { startGstVerificationRetentionJob } from './jobs/gstVerificationRetention.job';
import { startAadhaarVerificationRetentionJob } from './jobs/aadhaarVerificationRetention.job';
import { startDrivingLicenseVerificationRetentionJob } from './jobs/drivingLicenseVerificationRetention.job';
import { startRcOwnerHistoryRetentionJob } from './jobs/rcOwnerHistoryRetention.job';
import { storagePersistenceConfigured } from './utils/documentUpload';
import { startFinanceHubWorker } from './modules/finance-hub';
import { startCrmWorker } from './modules/crm';
import { startNotificationOutboxJob } from './jobs/notificationOutbox.job';
import { provisionAutomationRules } from './services/notificationAutomationProvisioning.service';
import { marketplaceWhatsAppEvents, recruitmentWhatsAppEvents } from './services/whatsappIntegration.service';
import { marketplaceSmsEvents, recruitmentSmsEvents } from './services/smsIntegration.service';
import prisma from './lib/prisma';
import { startAiDailyBriefingJob } from './jobs/aiDailyBriefing.job';
import { startAiDataSyncJob } from './jobs/aiDataSync.job';

const PORT = process.env.PORT || 5000;

// Cron jobs and workers run in exactly one process. When the API is scaled to more than one process
// (pm2 cluster, a second server, a staging copy pointed at the same database), set
// ENABLE_BACKGROUND_JOBS=false on all but one of them, or every job runs twice.
const backgroundJobsEnabled = !['false', '0', 'off', 'no'].includes((process.env.ENABLE_BACKGROUND_JOBS || '').trim().toLowerCase());

if (backgroundJobsEnabled) {
  startSoldListingRetentionJob();
  startDatabaseBackupJob();
  startPanVerificationRetentionJob();
  startGstVerificationRetentionJob();
  startAadhaarVerificationRetentionJob();
  startDrivingLicenseVerificationRetentionJob();
  startRcOwnerHistoryRetentionJob();
  // Finance Hub automatic posting; idle while posting mode is OFF.
  startFinanceHubWorker();
  // CRM follow-up reminders, missed marking, SLA and (opt-in) automation.
  startCrmWorker();
  // Automatic WhatsApp/SMS delivery retries and stale-lease recovery.
  startNotificationOutboxJob();
  // Daily briefing execution is database-coordinated; this timer only wakes the worker.
  startAiDailyBriefingJob();
  // AI read-only intelligence synchronization is also a singleton background worker.
  startAiDataSyncJob();
  void Promise.all([
    provisionAutomationRules(prisma.whatsAppAutomationRule, [...marketplaceWhatsAppEvents, ...recruitmentWhatsAppEvents]),
    provisionAutomationRules(prisma.smsAutomationRule, [...marketplaceSmsEvents, ...recruitmentSmsEvents]),
  ]).catch((error) => console.error('[notifications] unable to provision automation rules', error));
} else {
  console.log('[jobs] ENABLE_BACKGROUND_JOBS is off: cron jobs and workers are not started in this process.');
}

app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
  if (process.env.NODE_ENV === 'production' && !storagePersistenceConfigured) {
    console.warn('[storage] APP_STORAGE_DIR is not configured; local branding, secure, or legacy uploads will be lost on a fresh deployment.');
  }
  // Only for hosts that sleep idle apps (Render free tier); a VPS needs no self-ping.
  if (process.env.RENDER_EXTERNAL_URL) {
    startKeepAlive(PORT);
  }
});
