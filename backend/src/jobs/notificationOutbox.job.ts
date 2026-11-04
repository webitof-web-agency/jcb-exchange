import { processSmsOutbox } from '../services/smsIntegration.service';
import { processWhatsAppOutbox } from '../services/whatsappIntegration.service';

let timer: NodeJS.Timeout | null = null;
let running = false;

export const notificationOutboxTick = async () => {
  if (running) return { skipped: 'already running' as const };
  running = true;
  try {
    const [whatsapp, sms] = await Promise.all([
      processWhatsAppOutbox(),
      processSmsOutbox(),
    ]);
    return { whatsapp, sms };
  } catch (error) {
    console.error('[notifications] outbox worker tick failed:', error instanceof Error ? error.message : error);
    return { skipped: 'error' as const };
  } finally {
    running = false;
  }
};

/** Started from server.ts. NOTIFICATION_OUTBOX_WORKER=off disables it on a secondary instance. */
export const startNotificationOutboxJob = (intervalMs = 30 * 1000) => {
  if (timer || process.env.NOTIFICATION_OUTBOX_WORKER === 'off') return;
  setTimeout(() => { void notificationOutboxTick(); }, 30 * 1000).unref();
  timer = setInterval(() => { void notificationOutboxTick(); }, intervalMs);
  timer.unref();
};
