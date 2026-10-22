import { isCrmSchemaMissing } from './http';
import { runCrmAutomation } from './services/automation.service';

let timer: NodeJS.Timeout | null = null;
let running = false;
let schemaWarned = false;

export const crmTick = async () => {
  if (running) return { skipped: 'already running' as const };
  running = true;
  try {
    return await runCrmAutomation();
  } catch (error) {
    if (isCrmSchemaMissing(error)) {
      if (!schemaWarned) console.warn('[crm] worker idle: CRM tables are not installed yet.');
      schemaWarned = true;
      return { skipped: 'schema missing' as const };
    }
    console.error('[crm] automation tick failed:', error);
    return { skipped: 'error' as const };
  } finally {
    running = false;
  }
};

/** Started from server.ts. CRM_WORKER=off disables it (e.g. on a second instance). */
export const startCrmWorker = (intervalMs = 60 * 1000) => {
  if (timer || process.env.CRM_WORKER === 'off') return;
  setTimeout(() => { void crmTick(); }, 45 * 1000).unref();
  timer = setInterval(() => { void crmTick(); }, intervalMs);
  timer.unref();
};
