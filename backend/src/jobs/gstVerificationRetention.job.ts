import cron from 'node-cron';
import { gstVerificationService } from '../services/gstVerification.service';

let jobStarted = false;

const runCleanup = async () => {
  try {
    const deletedCount = await gstVerificationService.cleanupExpiredRawData();
    if (deletedCount > 0) {
      console.log(`[cron] GST raw-data cleanup removed ${deletedCount} expired result(s).`);
    }
  } catch (error) {
    console.error('[cron] GST raw-data cleanup failed:', error instanceof Error ? error.message : error);
  }
};

export const startGstVerificationRetentionJob = () => {
  if (jobStarted) return;
  jobStarted = true;
  void runCleanup();
  cron.schedule('* * * * *', () => { void runCleanup(); }, { timezone: 'Asia/Kolkata' });
  console.log('[cron] GST raw-data retention job registered — runs every minute.');
};
