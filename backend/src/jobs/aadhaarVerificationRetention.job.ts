import cron from 'node-cron';
import { aadhaarVerificationService } from '../services/aadhaarVerification.service';

let jobStarted = false;

const runCleanup = async () => {
  try {
    const clearedCount = await aadhaarVerificationService.cleanupExpiredRawData();
    if (clearedCount > 0) {
      console.log(`[cron] Aadhaar raw-data cleanup cleared ${clearedCount} expired result(s).`);
    }
  } catch (error) {
    console.error('[cron] Aadhaar raw-data cleanup failed:', error instanceof Error ? error.message : error);
  }
};

export const startAadhaarVerificationRetentionJob = () => {
  if (jobStarted) return;
  jobStarted = true;
  void runCleanup();
  cron.schedule('* * * * *', () => { void runCleanup(); }, { timezone: 'Asia/Kolkata' });
  console.log('[cron] Aadhaar raw-data retention job registered — runs every minute.');
};
