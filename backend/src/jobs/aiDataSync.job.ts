import cron, { type ScheduledTask } from 'node-cron';
import { runAiSyncCycle } from '../services/ai/aiSync.service';

let task: ScheduledTask | null = null;
let running = false;

export const aiDataSyncTick = async () => runAiSyncCycle();

/**
 * Exact AI answers still read live source tables. This worker records domain
 * freshness and provides a safe, database-coordinated hook for future CDC or
 * search-index consumers. It never sends source rows to an AI provider.
 */
export const startAiDataSyncJob = () => {
  if (task || process.env.AI_INTELLIGENCE_SYNC_WORKER === 'off') return;
  task = cron.schedule('*/5 * * * *', () => {
    if (running) return;
    running = true;
    void aiDataSyncTick()
      .catch((error) => console.error('[ai-sync] worker tick failed:', error instanceof Error ? error.message : error))
      .finally(() => { running = false; });
  });
  setTimeout(() => {
    if (running) return;
    running = true;
    void aiDataSyncTick()
      .catch((error) => console.error('[ai-sync] startup catch-up failed:', error instanceof Error ? error.message : error))
      .finally(() => { running = false; });
  }, 30_000).unref();
};
