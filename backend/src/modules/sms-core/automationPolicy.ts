export type SmsAutomationDecision =
  | { shouldQueue: true; recipientPhone: string }
  | { shouldQueue: false; reason: 'INTEGRATION_DISABLED' | 'AUTOMATION_DISABLED' | 'MESSAGE_ID_REQUIRED' | 'RECIPIENT_PHONE_INVALID' };

export const normalizeSmsRecipientPhone = (value?: string | null) => {
  const digits = String(value || '').replace(/\D/g, '');
  const withoutCountryCode = digits.length === 12 && digits.startsWith('91') ? digits.slice(2) : digits;
  return /^[6-9]\d{9}$/.test(withoutCountryCode) ? withoutCountryCode : null;
};

export const resolveSmsTestRecipientPhone = (value: string | null | undefined, current: string | null | undefined) => {
  if (!value?.trim()) return normalizeSmsRecipientPhone(current);
  return normalizeSmsRecipientPhone(value);
};

export const evaluateSmsAutomation = ({
  integrationEnabled,
  recipientPhone,
  rule,
}: {
  integrationEnabled: boolean;
  recipientPhone?: string | null | undefined;
  rule?: { enabled: boolean; messageId?: string | null } | null;
}): SmsAutomationDecision => {
  if (!integrationEnabled) return { shouldQueue: false, reason: 'INTEGRATION_DISABLED' };
  if (!rule?.enabled) return { shouldQueue: false, reason: 'AUTOMATION_DISABLED' };
  if (!rule.messageId?.trim()) return { shouldQueue: false, reason: 'MESSAGE_ID_REQUIRED' };
  const normalizedPhone = normalizeSmsRecipientPhone(recipientPhone);
  if (!normalizedPhone) return { shouldQueue: false, reason: 'RECIPIENT_PHONE_INVALID' };
  return { shouldQueue: true, recipientPhone: normalizedPhone };
};

export { renderSmsVariables } from './templatePolicy';
