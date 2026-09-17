export const whatsappTemplatePurposes = ['MARKETPLACE', 'RECRUITMENT', 'MARKETING', 'JOB_ALERTS'] as const;

export type WhatsAppTemplatePurpose = (typeof whatsappTemplatePurposes)[number];

export const isWhatsAppTemplatePurpose = (value: unknown): value is WhatsAppTemplatePurpose =>
  typeof value === 'string' && whatsappTemplatePurposes.includes(value as WhatsAppTemplatePurpose);

export const assertWhatsAppTemplatePurpose = (value: unknown): WhatsAppTemplatePurpose => {
  if (!isWhatsAppTemplatePurpose(value)) {
    throw new Error('Select a valid WhatsApp template purpose.');
  }
  return value;
};

export const isWhatsAppTemplatePurposeAllowed = (purpose: string | null | undefined, allowedPurposes: readonly WhatsAppTemplatePurpose[]) =>
  Boolean(purpose && allowedPurposes.includes(purpose as WhatsAppTemplatePurpose));

export const getWhatsAppReminderTemplatePurpose = (kind: string): WhatsAppTemplatePurpose =>
  kind === 'INTERVIEW_48_HOURS' ? 'JOB_ALERTS' : 'MARKETING';
