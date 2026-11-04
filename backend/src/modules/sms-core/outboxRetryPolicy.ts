export const MAX_SMS_OUTBOX_ATTEMPTS = 3;

const SMS_RETRY_DELAYS_MS = [30_000, 5 * 60_000] as const;

export const canRetrySmsOutbox = ({ status, attempts }: { status: string; attempts: number }) =>
  status === 'FAILED' && attempts < MAX_SMS_OUTBOX_ATTEMPTS;

export const getNextSmsAttemptAt = ({ attempts, now = new Date() }: { attempts: number; now?: Date }) => {
  const delay = SMS_RETRY_DELAYS_MS[attempts - 1];
  return delay === undefined ? null : new Date(now.getTime() + delay);
};

export const isSmsOutboxDue = ({
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
  canRetrySmsOutbox({ status, attempts }) && (nextAttemptAt === null || nextAttemptAt.getTime() <= now.getTime());
