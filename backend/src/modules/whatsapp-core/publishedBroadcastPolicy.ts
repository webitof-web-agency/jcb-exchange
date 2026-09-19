export type WhatsAppPublishedBroadcastEvent =
  | 'MARKETPLACE_NEW_LISTING_PUBLISHED'
  | 'RECRUITMENT_NEW_JOB_PUBLISHED';

export type WhatsAppPublishedBroadcastAudience = 'MARKETPLACE' | 'RECRUITMENT';
export type WhatsAppPublishedBroadcastConsentCategory = 'MARKETING' | 'JOB_ALERTS';
export type WhatsAppPublishedBroadcastRecipientType = 'CUSTOMER' | 'CANDIDATE';

export const getWhatsAppPublishedBroadcastAudience = (eventCode: WhatsAppPublishedBroadcastEvent): WhatsAppPublishedBroadcastAudience =>
  eventCode === 'MARKETPLACE_NEW_LISTING_PUBLISHED' ? 'MARKETPLACE' : 'RECRUITMENT';

export const getWhatsAppPublishedBroadcastConsentCategory = (eventCode: WhatsAppPublishedBroadcastEvent): WhatsAppPublishedBroadcastConsentCategory =>
  eventCode === 'MARKETPLACE_NEW_LISTING_PUBLISHED' ? 'MARKETING' : 'JOB_ALERTS';

export const getWhatsAppPublishedBroadcastRecipientType = (eventCode: WhatsAppPublishedBroadcastEvent): WhatsAppPublishedBroadcastRecipientType =>
  eventCode === 'MARKETPLACE_NEW_LISTING_PUBLISHED' ? 'CUSTOMER' : 'CANDIDATE';

const getTextValue = (value: unknown, fallback: string) => {
  const normalized = String(value ?? '').trim();
  return normalized || fallback;
};

export const getWhatsAppPublishedTemplateComponents = (
  eventCode: WhatsAppPublishedBroadcastEvent,
  payloadSnapshot: Record<string, unknown>,
) => {
  const value = eventCode === 'MARKETPLACE_NEW_LISTING_PUBLISHED'
    ? getTextValue(payloadSnapshot.vehicleShortTitle || payloadSnapshot.listingTitle, 'Vehicle listing')
    : getTextValue(payloadSnapshot.jobTitle, 'New job');

  return [{
    type: 'body',
    parameters: [{ type: 'text', text: value }],
  }];
};
