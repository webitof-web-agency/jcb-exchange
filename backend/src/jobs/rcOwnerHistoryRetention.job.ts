import cron from 'node-cron';
import { rcOwnerHistoryService } from '../services/rcOwnerHistory.service';

let jobStarted = false;

const runCleanup = async () => {
  try {
    const deletedCount = await rcOwnerHistoryService.cleanupExpiredRawData();
    if (deletedCount > 0) {
      console.log(`[cron] RC owner-history raw-data cleanup removed ${deletedCount} expired result(s).`);
    }
  } catch (error) {
    console.error('[cron] RC owner-history raw-data cleanup failed:', error instanceof Error ? error.message : error);
  }
};

export const startRcOwnerHistoryRetentionJob = () => {
  if (jobStarted) return;
  jobStarted = true;
  void runCleanup();
  cron.schedule('* * * * *', () => { void runCleanup(); }, { timezone: 'Asia/Kolkata' });
  console.log('[cron] RC owner-history raw-data retention job registered — runs every minute.');
};
