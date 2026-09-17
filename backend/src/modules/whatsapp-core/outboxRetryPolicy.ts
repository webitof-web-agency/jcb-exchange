export const MAX_WHATSAPP_OUTBOX_ATTEMPTS = 3;

export const canRetryWhatsAppOutbox = ({ status, attempts }: { status: string; attempts: number }) =>
  status === 'FAILED' && attempts < MAX_WHATSAPP_OUTBOX_ATTEMPTS;
