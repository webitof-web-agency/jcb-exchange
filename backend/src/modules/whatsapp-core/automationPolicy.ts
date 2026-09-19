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

export const normalizeWhatsAppRecipientPhone = (value?: string | null) => {
  const digits = String(value || '').replace(/\D/g, '');
  return digits.length >= 8 && digits.length <= 15 ? digits : null;
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
