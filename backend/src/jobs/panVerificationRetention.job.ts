import cron from 'node-cron';
import { panVerificationService } from '../services/panVerification.service';

let jobStarted = false;

const runCleanup = async () => {
  try {
    const deletedCount = await panVerificationService.cleanupExpiredRawData();
    if (deletedCount > 0) {
      console.log(`[cron] PAN raw-data cleanup removed ${deletedCount} expired result(s).`);
    }
  } catch (error) {
    console.error('[cron] PAN raw-data cleanup failed:', error instanceof Error ? error.message : error);
  }
};

export const startPanVerificationRetentionJob = () => {
  if (jobStarted) return;
  jobStarted = true;
  void runCleanup();
  cron.schedule('* * * * *', () => { void runCleanup(); }, { timezone: 'Asia/Kolkata' });
  console.log('[cron] PAN raw-data retention job registered — runs every minute.');
};