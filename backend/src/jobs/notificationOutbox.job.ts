import { processSmsOutbox } from '../services/smsIntegration.service';
import { processWhatsAppOutbox } from '../services/whatsappIntegration.service';
import { processTransactionalEmailOutbox } from '../services/recruitmentEmail.service';
import { retryPendingOfferHandoffs } from '../modules/hrm/services/offerHandoff.service';

let timer: NodeJS.Timeout | null = null;
let running = false;

export const notificationOutboxTick = async () => {
  if (running) return { skipped: 'already running' as const };
  running = true;
  try {
    const [whatsapp, sms, email, hrmHandoffs] = await Promise.all([
      processWhatsAppOutbox(),
      processSmsOutbox(),
      processTransactionalEmailOutbox(),
      // Accepted offers whose HRM pre-joining record failed or never ran.
      retryPendingOfferHandoffs().catch((error) => {
        console.error('[hrm] offer handoff retry failed:', error instanceof Error ? error.message : error);
        return { processed: 0 };
      }),
    ]);
    return { whatsapp, sms, email, hrmHandoffs };
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
