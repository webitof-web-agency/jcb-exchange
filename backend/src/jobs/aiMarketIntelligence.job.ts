import cron, { type ScheduledTask } from 'node-cron';
import { ingestMarketSources } from '../services/ai/marketIntelligence.service';

let task: ScheduledTask | null = null;
let running = false;

export const aiMarketIntelligenceTick = async () => ingestMarketSources();

/**
 * Fetches only the administrator-configured RSS/Atom allowlist once per day.
 * The job stores source-attributed recommendations and never mutates business data.
 */
export const startAiMarketIntelligenceJob = () => {
  if (task || process.env.AI_MARKET_INTELLIGENCE_WORKER === 'off') return;
  task = cron.schedule('15 7 * * *', () => {
    if (running) return;
    running = true;
    void aiMarketIntelligenceTick()
      .catch((error) => console.error('[ai-market] worker tick failed:', error instanceof Error ? error.message : error))
      .finally(() => { running = false; });
  }, { timezone: 'Asia/Kolkata' });
};
