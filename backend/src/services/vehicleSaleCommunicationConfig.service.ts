import { validateSmsTemplateConfiguration } from '../modules/sms-core/templatePolicy';

export const VEHICLE_SALE_COMMUNICATION_EVENTS = [
  'VEHICLE_SALE_INVOICE',
  'VEHICLE_SALE_PAYMENT_RECEIPT',
] as const;

type VehicleSaleEvent = (typeof VEHICLE_SALE_COMMUNICATION_EVENTS)[number];

export type VehicleSaleCommunicationInput = {
  whatsapp: {
    enabled: boolean;
    credentialsConfigured: boolean;
    rules: Partial<Record<VehicleSaleEvent, {
      enabled: boolean;
      templateLinked: boolean;
      templateApproved: boolean;
      metaTemplateId: string | null;
    }>>;
  };
  sms: {
    enabled: boolean;
    credentialsConfigured: boolean;
    rules: Partial<Record<VehicleSaleEvent, {
      enabled: boolean;
      messageId: string | null;
      variablesTemplate: string | null;
    }>>;
  };
};

export type VehicleSaleChannelReadiness = {
  ready: boolean;
  missing: string[];
};

export type VehicleSaleCommunicationReadiness = {
  whatsapp: VehicleSaleChannelReadiness;
  sms: VehicleSaleChannelReadiness;
};

export const evaluateVehicleSaleCommunicationReadiness = (
  input: VehicleSaleCommunicationInput,
): VehicleSaleCommunicationReadiness => {
  const whatsappMissing: string[] = [];
  if (!input.whatsapp.enabled) whatsappMissing.push('WhatsApp integration is disabled.');
  if (!input.whatsapp.credentialsConfigured) whatsappMissing.push('WhatsApp credentials are not configured.');

  const smsMissing: string[] = [];
  if (!input.sms.enabled) smsMissing.push('SMS integration is disabled.');
  if (!input.sms.credentialsConfigured) smsMissing.push('SMS credentials or DLT sender ID are not configured.');

  for (const eventCode of VEHICLE_SALE_COMMUNICATION_EVENTS) {
    const whatsappRule = input.whatsapp.rules[eventCode];
    if (!whatsappRule?.enabled) whatsappMissing.push(`${eventCode}: automation rule is disabled.`);
    if (!whatsappRule?.templateLinked) whatsappMissing.push(`${eventCode}: WhatsApp template is not linked.`);
    if (!whatsappRule?.templateApproved) whatsappMissing.push(`${eventCode}: WhatsApp template is not approved.`);
    if (!whatsappRule?.metaTemplateId) whatsappMissing.push(`${eventCode}: Meta template ID is missing.`);

    const smsRule = input.sms.rules[eventCode];
    if (!smsRule?.enabled) smsMissing.push(`${eventCode}: SMS automation rule is disabled.`);
    if (!smsRule?.messageId) smsMissing.push(`${eventCode}: approved DLT message ID is missing.`);
    try {
      validateSmsTemplateConfiguration(eventCode, Boolean(smsRule?.enabled), smsRule?.variablesTemplate);
    } catch (error) {
      smsMissing.push(`${eventCode}: ${error instanceof Error ? error.message : 'DLT variable mapping is invalid.'}`);
    }
  }

  return {
    whatsapp: { ready: whatsappMissing.length === 0, missing: whatsappMissing },
    sms: { ready: smsMissing.length === 0, missing: smsMissing },
  };
};
