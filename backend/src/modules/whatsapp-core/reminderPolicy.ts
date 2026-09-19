export const whatsappReminderKinds = ['INTERVIEW_48_HOURS', 'PRIME_EXPIRY_7_DAYS'] as const;
export type WhatsAppReminderKind = (typeof whatsappReminderKinds)[number];

const reminderWindowConfig: Record<WhatsAppReminderKind, { defaultValue: number; maxValue: number; unit: 'hours' | 'days' }> = {
  INTERVIEW_48_HOURS: { defaultValue: 48, maxValue: 720, unit: 'hours' },
  PRIME_EXPIRY_7_DAYS: { defaultValue: 7, maxValue: 365, unit: 'days' },
};

export const getWhatsAppReminderWindow = (kind: WhatsAppReminderKind, requestedValue?: number) => {
  const config = reminderWindowConfig[kind];
  const value = requestedValue ?? config.defaultValue;
  if (!Number.isInteger(value) || value < 1 || value > config.maxValue) {
    throw new Error(`Reminder window must be a whole number between 1 and ${config.maxValue} ${config.unit}.`);
  }
  return value;
};

export const getWhatsAppReminderDefinition = (kind: WhatsAppReminderKind, requestedValue?: number) => {
  const value = getWhatsAppReminderWindow(kind, requestedValue);
  return kind === 'INTERVIEW_48_HOURS'
    ? { category: 'JOB_ALERTS' as const, recipientType: 'CANDIDATE' as const, title: `Interview reminder · next ${value} hours` }
    : { category: 'MARKETING' as const, recipientType: 'CUSTOMER' as const, title: `Prime expiry reminder · next ${value} days` };
};

export const getWhatsAppReminderWindowUnit = (kind: WhatsAppReminderKind) => reminderWindowConfig[kind].unit;
