import cron from 'node-cron';
import { drivingLicenseVerificationService } from '../services/drivingLicenseVerification.service';

let jobStarted = false;

const runCleanup = async () => {
  try {
    const deletedCount = await drivingLicenseVerificationService.cleanupExpiredRawData();
    if (deletedCount > 0) {
      console.log(`[cron] Driving-license raw-data cleanup removed ${deletedCount} expired result(s).`);
    }
  } catch (error) {
    console.error('[cron] Driving-license raw-data cleanup failed:', error instanceof Error ? error.message : error);
  }
};

export const startDrivingLicenseVerificationRetentionJob = () => {
  if (jobStarted) return;
  jobStarted = true;
  void runCleanup();
  cron.schedule('* * * * *', () => { void runCleanup(); }, { timezone: 'Asia/Kolkata' });
  console.log('[cron] Driving-license raw-data retention job registered — runs every minute.');
};
