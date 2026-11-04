export const MAX_WHATSAPP_OUTBOX_ATTEMPTS = 3;

const WHATSAPP_RETRY_DELAYS_MS = [30_000, 5 * 60_000] as const;

export const canRetryWhatsAppOutbox = ({ status, attempts }: { status: string; attempts: number }) =>
  status === 'FAILED' && attempts < MAX_WHATSAPP_OUTBOX_ATTEMPTS;

export const getNextWhatsAppAttemptAt = ({ attempts, now = new Date() }: { attempts: number; now?: Date }) => {
  const delay = WHATSAPP_RETRY_DELAYS_MS[attempts - 1];
  return delay === undefined ? null : new Date(now.getTime() + delay);
};

export const isWhatsAppOutboxDue = ({
  status,
  attempts,
  nextAttemptAt,
  now = new Date(),
}: {
  status: string;
  attempts: number;
  nextAttemptAt: Date | null;
  now?: Date;
}) =>
  canRetryWhatsAppOutbox({ status, attempts }) && (nextAttemptAt === null || nextAttemptAt.getTime() <= now.getTime());
