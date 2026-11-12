export type WhatsAppAutomationRulePolicy = {
  enabled: boolean;
  templateId: string | null;
  templateStatus: string | null;
  metaTemplateId: string | null;
};

export type WhatsAppAutomationDecision =
  | { shouldQueue: true; recipientPhone: string }
  | {
    shouldQueue: false;
    reason:
      | 'INTEGRATION_DISABLED'
      | 'RECIPIENT_PHONE_REQUIRED'
      | 'AUTOMATION_DISABLED'
      | 'APPROVED_TEMPLATE_REQUIRED';
  };

/**
 * Meta's Cloud API needs the full international number (country code, no "+").
 * Accounts store Indian mobiles as 10 digits, so those (and 0-prefixed 11-digit forms) get the 91 prefix;
 * anything already international is kept as is.
 */
export const normalizeWhatsAppRecipientPhone = (value?: string | null) => {
  let digits = String(value || '').replace(/\D/g, '');
  if (digits.length === 11 && digits.startsWith('0')) digits = digits.slice(1);
  if (digits.length === 10 && /^[6-9]/.test(digits)) digits = `91${digits}`;
  return digits.length >= 11 && digits.length <= 15 ? digits : null;
};

export const isWhatsAppDeliveryAllowed = ({
  integrationEnabled,
  credentialsConfigured,
}: {
  integrationEnabled: boolean;
  credentialsConfigured: boolean;
}) => integrationEnabled && credentialsConfigured;

export const evaluateWhatsAppAutomation = ({
  integrationEnabled,
  recipientPhone,
  rule,
}: {
  integrationEnabled: boolean;
  recipientPhone?: string | null | undefined;
  rule?: WhatsAppAutomationRulePolicy | null;
}): WhatsAppAutomationDecision => {
  if (!integrationEnabled) return { shouldQueue: false, reason: 'INTEGRATION_DISABLED' };

  const normalizedPhone = normalizeWhatsAppRecipientPhone(recipientPhone);
  if (!normalizedPhone) return { shouldQueue: false, reason: 'RECIPIENT_PHONE_REQUIRED' };
  if (!rule?.enabled) return { shouldQueue: false, reason: 'AUTOMATION_DISABLED' };
  if (!rule.templateId || rule.templateStatus !== 'APPROVED' || !rule.metaTemplateId) {
    return { shouldQueue: false, reason: 'APPROVED_TEMPLATE_REQUIRED' };
  }

  return { shouldQueue: true, recipientPhone: normalizedPhone };
};
