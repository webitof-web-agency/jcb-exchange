import crypto from 'crypto';
import { Prisma, type WhatsAppRecipientType } from '@prisma/client';
import prisma from '../lib/prisma';
import { decryptWhatsAppCredential, encryptWhatsAppCredential } from './whatsappCredentialCrypto';
import {
  evaluateWhatsAppAutomation,
  isWhatsAppDeliveryAllowed,
  canRetryWhatsAppOutbox,
  sendWhatsAppTemplate,
  sendWhatsAppText,
  normalizeWhatsAppRecipientPhone,
  assertWhatsAppTemplatePurpose,
  isWhatsAppTemplatePurposeAllowed,
  type WhatsAppTemplatePurpose,
} from '../modules/whatsapp-core';

const SETTINGS_ID = 'default';
const MAX_TEST_MESSAGE_LENGTH = 500;

export const marketplaceWhatsAppEvents = [
  'PARTNER_KYC_STATUS_UPDATED',
  'PARTNER_LISTING_STATUS_UPDATED',
  'LISTING_PAYMENT_SUBMITTED',
  'LISTING_PAYMENT_APPROVED',
  'LISTING_PAYMENT_REJECTED',
  'CUSTOMER_PRIME_APPROVED',
  'CUSTOMER_PRIME_REJECTED',
] as const;

export type MarketplaceWhatsAppEvent = (typeof marketplaceWhatsAppEvents)[number];

export const recruitmentWhatsAppEvents = [
  'RECRUITMENT_APPLICATION_RECEIVED',
  'RECRUITMENT_NEW_APPLICATION_SUPERADMIN',
  'RECRUITMENT_NEW_APPLICATION_RECRUITER',
  'RECRUITMENT_APPLICATION_STAGE_UPDATED',
  'RECRUITMENT_INTERVIEW_SCHEDULED',
  'RECRUITMENT_INTERVIEW_RESCHEDULED',
  'RECRUITMENT_INTERVIEW_CANCELLED',
  'RECRUITMENT_OFFER_SENT',
  'RECRUITMENT_OFFER_STATUS_UPDATED',
] as const;

export type RecruitmentWhatsAppEvent = (typeof recruitmentWhatsAppEvents)[number];
type WhatsAppAutomationEvent = MarketplaceWhatsAppEvent | RecruitmentWhatsAppEvent;

const getWhatsAppAutomationConfiguration = async (
  eventCodes: readonly WhatsAppAutomationEvent[],
  allowedTemplatePurposes: readonly WhatsAppTemplatePurpose[],
) => {
  const [templates, existingRules] = await Promise.all([
    prisma.whatsAppMetaTemplate.findMany({
      where: { category: { in: [...allowedTemplatePurposes] } },
      orderBy: [{ status: 'asc' }, { name: 'asc' }],
      select: { id: true, name: true, language: true, metaTemplateId: true, category: true, status: true, components: true, updatedAt: true },
    }),
    prisma.whatsAppAutomationRule.findMany({
      where: { eventCode: { in: [...eventCodes] } },
      select: { id: true, eventCode: true, enabled: true, templateId: true, recipientPolicy: true, updatedAt: true },
    }),
  ]);
  const byEvent = new Map(existingRules.map((rule) => [rule.eventCode, rule]));
  return {
    templates,
    rules: eventCodes.map((eventCode) => byEvent.get(eventCode) || {
      id: null,
      eventCode,
      enabled: false,
      templateId: null,
      recipientPolicy: null,
      updatedAt: null,
    }),
  };
};

export const getWhatsAppMetaTemplates = async (purpose?: WhatsAppTemplatePurpose) => prisma.whatsAppMetaTemplate.findMany({
  ...(purpose ? { where: { category: purpose } } : {}),
  orderBy: [{ category: 'asc' }, { status: 'asc' }, { name: 'asc' }],
  select: { id: true, name: true, language: true, metaTemplateId: true, category: true, status: true, components: true, updatedAt: true },
});

export const getMarketplaceWhatsAppAutomationConfiguration = () =>
  getWhatsAppAutomationConfiguration(marketplaceWhatsAppEvents, ['MARKETPLACE']);
export const getRecruitmentWhatsAppAutomationConfiguration = () =>
  getWhatsAppAutomationConfiguration(recruitmentWhatsAppEvents, ['RECRUITMENT']);

export const saveWhatsAppMetaTemplate = async ({
  id,
  name,
  language,
  metaTemplateId,
  category,
  status,
  components,
}: {
  id?: string;
  name: string;
  language: string;
  metaTemplateId?: string | null;
  category?: string | null;
  status: string;
  components?: unknown;
}) => {
  const data = {
    name: name.trim(),
    language: language.trim() || 'en_US',
    metaTemplateId: metaTemplateId?.trim() || null,
    category: assertWhatsAppTemplatePurpose(category?.trim()),
    status: status.trim().toUpperCase(),
    ...(components === undefined ? {} : { components: components as Prisma.InputJsonValue }),
  };
  if (!data.name || data.name.length > 512 || !/^[a-z0-9_]+$/.test(data.name)) {
    throw new Error('Template name must contain lowercase letters, numbers, and underscores only.');
  }
  if (!/^[a-z]{2}_[A-Z]{2}$/.test(data.language)) {
    throw new Error('Template language must use the format en_US.');
  }
  if (!['DRAFT', 'PENDING', 'APPROVED', 'REJECTED', 'PAUSED', 'DISABLED'].includes(data.status)) {
    throw new Error('Invalid Meta template status.');
  }
  if (data.status === 'APPROVED' && !data.metaTemplateId) {
    throw new Error('Meta Template ID is required before a template can be marked approved.');
  }
  return id
    ? prisma.whatsAppMetaTemplate.update({ where: { id }, data })
    : prisma.whatsAppMetaTemplate.create({ data });
};

const saveWhatsAppAutomationRule = async ({
  eventCode,
  enabled,
  templateId,
  allowedTemplatePurposes,
}: {
  eventCode: WhatsAppAutomationEvent;
  enabled: boolean;
  templateId?: string | null;
  allowedTemplatePurposes: readonly WhatsAppTemplatePurpose[];
}) => {
  const selectedTemplate = templateId
    ? await prisma.whatsAppMetaTemplate.findUnique({ where: { id: templateId }, select: { id: true, status: true, metaTemplateId: true, category: true } })
    : null;
  if (selectedTemplate && !isWhatsAppTemplatePurposeAllowed(selectedTemplate.category, allowedTemplatePurposes)) {
    throw new Error('Selected template does not belong to this WhatsApp module.');
  }
  if (enabled && (!selectedTemplate || selectedTemplate.status !== 'APPROVED' || !selectedTemplate.metaTemplateId)) {
    throw new Error('Select an approved Meta template before enabling this automation.');
  }
  return prisma.whatsAppAutomationRule.upsert({
    where: { eventCode },
    update: { enabled, templateId: templateId || null },
    create: { eventCode, enabled, templateId: templateId || null },
  });
};

export const saveMarketplaceWhatsAppAutomationRule = (input: {
  eventCode: MarketplaceWhatsAppEvent;
  enabled: boolean;
  templateId?: string | null;
}) => saveWhatsAppAutomationRule({ ...input, allowedTemplatePurposes: ['MARKETPLACE'] });

export const saveRecruitmentWhatsAppAutomationRule = (input: {
  eventCode: RecruitmentWhatsAppEvent;
  enabled: boolean;
  templateId?: string | null;
}) => saveWhatsAppAutomationRule({ ...input, allowedTemplatePurposes: ['RECRUITMENT'] });

type CredentialInput = {
  accessToken?: string;
  webhookVerifyToken?: string;
  appSecret?: string;
};

type SettingsInput = CredentialInput & {
  enabled?: boolean;
  graphApiVersion?: string;
  phoneNumberId?: string;
  businessAccountId?: string;
  testRecipientPhone?: string;
  updatedByUserId: string;
};

const credentialSecret = () => {
  const secret = process.env.WHATSAPP_SETTINGS_SECRET?.trim();
  if (!secret) {
    throw new Error('WHATSAPP_SETTINGS_SECRET is required before WhatsApp credentials can be saved.');
  }
  return secret;
};

const hasUsableCredentialSecret = () => /^[a-fA-F0-9]{64}$/.test(process.env.WHATSAPP_SETTINGS_SECRET?.trim() || '');

const normalizePhone = (value: string) => {
  const digits = value.replace(/\D/g, '');
  if (digits.length < 8 || digits.length > 15) {
    throw new Error('Enter a valid WhatsApp phone number including country code.');
  }
  return digits;
};

const maskPhone = (value?: string | null) => {
  if (!value) return '';
  return `${'*'.repeat(Math.max(0, value.length - 4))}${value.slice(-4)}`;
};

const graphApiVersion = (value?: string | null) => {
  const normalized = value?.trim() || 'v23.0';
  if (!/^v\d+\.\d+$/.test(normalized)) {
    throw new Error('Graph API version must use the format vNN.N.');
  }
  return normalized;
};

const hasEncryptedCredentials = (settings: {
  encryptedAccessToken: string | null;
  encryptedWebhookVerifyToken: string | null;
  encryptedAppSecret: string | null;
  phoneNumberId: string | null;
}) => Boolean(
  settings.phoneNumberId
  && settings.encryptedAccessToken
  && settings.encryptedWebhookVerifyToken
  && settings.encryptedAppSecret,
);

const serializeSettings = (settings: {
  enabled: boolean;
  graphApiVersion: string;
  phoneNumberId: string | null;
  businessAccountId: string | null;
  testRecipientPhone: string | null;
  encryptedAccessToken: string | null;
  encryptedWebhookVerifyToken: string | null;
  encryptedAppSecret: string | null;
  updatedAt: Date;
}) => ({
  enabled: settings.enabled,
  ready: hasEncryptedCredentials(settings) && hasUsableCredentialSecret(),
  graphApiVersion: settings.graphApiVersion,
  phoneNumberId: settings.phoneNumberId || '',
  businessAccountId: settings.businessAccountId || '',
  testRecipientPhoneMasked: maskPhone(settings.testRecipientPhone),
  credentials: {
    accessTokenConfigured: Boolean(settings.encryptedAccessToken),
    webhookVerifyTokenConfigured: Boolean(settings.encryptedWebhookVerifyToken),
    appSecretConfigured: Boolean(settings.encryptedAppSecret),
  },
  updatedAt: settings.updatedAt,
});

export const getWhatsAppSettings = async () => {
  const settings = await prisma.whatsAppIntegrationSettings.upsert({
    where: { id: SETTINGS_ID },
    update: {},
    create: { id: SETTINGS_ID },
  });
  return serializeSettings(settings);
};

export const updateWhatsAppSettings = async (input: SettingsInput) => {
  const current = await prisma.whatsAppIntegrationSettings.upsert({
    where: { id: SETTINGS_ID },
    update: {},
    create: { id: SETTINGS_ID },
  });

  const secretValues: CredentialInput = {
    ...(input.accessToken?.trim() ? { accessToken: input.accessToken.trim() } : {}),
    ...(input.webhookVerifyToken?.trim() ? { webhookVerifyToken: input.webhookVerifyToken.trim() } : {}),
    ...(input.appSecret?.trim() ? { appSecret: input.appSecret.trim() } : {}),
  };
  const hasNewCredentials = Object.keys(secretValues).length > 0;
  const secret = hasNewCredentials ? credentialSecret() : null;
  const nextPhoneNumberId = input.phoneNumberId === undefined
    ? current.phoneNumberId
    : input.phoneNumberId.trim() || null;
  const nextSettings = {
    phoneNumberId: nextPhoneNumberId,
    encryptedAccessToken: secretValues.accessToken
      ? encryptWhatsAppCredential(secretValues.accessToken, secret!)
      : current.encryptedAccessToken,
    encryptedWebhookVerifyToken: secretValues.webhookVerifyToken
      ? encryptWhatsAppCredential(secretValues.webhookVerifyToken, secret!)
      : current.encryptedWebhookVerifyToken,
    encryptedAppSecret: secretValues.appSecret
      ? encryptWhatsAppCredential(secretValues.appSecret, secret!)
      : current.encryptedAppSecret,
  };
  const enabled = input.enabled === undefined ? current.enabled : input.enabled === true;

  if (enabled && !hasEncryptedCredentials(nextSettings)) {
    throw new Error('Add Phone Number ID, Access Token, Webhook Verify Token, and App Secret before enabling WhatsApp.');
  }

  const settings = await prisma.whatsAppIntegrationSettings.update({
    where: { id: SETTINGS_ID },
    data: {
      enabled,
      graphApiVersion: input.graphApiVersion === undefined
        ? current.graphApiVersion
        : graphApiVersion(input.graphApiVersion),
      phoneNumberId: nextPhoneNumberId,
      businessAccountId: input.businessAccountId === undefined
        ? current.businessAccountId
        : input.businessAccountId.trim() || null,
      testRecipientPhone: input.testRecipientPhone === undefined
        ? current.testRecipientPhone
        : input.testRecipientPhone.trim()
          ? normalizePhone(input.testRecipientPhone)
          : null,
      encryptedAccessToken: nextSettings.encryptedAccessToken,
      encryptedWebhookVerifyToken: nextSettings.encryptedWebhookVerifyToken,
      encryptedAppSecret: nextSettings.encryptedAppSecret,
      updatedByUserId: input.updatedByUserId,
    },
  });

  return serializeSettings(settings);
};

const getEnabledSettings = async () => {
  const settings = await prisma.whatsAppIntegrationSettings.findUnique({ where: { id: SETTINGS_ID } });
  if (!settings || !isWhatsAppDeliveryAllowed({ integrationEnabled: settings.enabled, credentialsConfigured: hasEncryptedCredentials(settings) })) {
    throw new Error('WhatsApp is not configured and enabled yet.');
  }
  return settings;
};

export const isWhatsAppIntegrationEnabled = async () => {
  const settings = await prisma.whatsAppIntegrationSettings.findUnique({ where: { id: SETTINGS_ID } });
  return Boolean(settings && isWhatsAppDeliveryAllowed({ integrationEnabled: settings.enabled, credentialsConfigured: hasEncryptedCredentials(settings) }));
};

type StoredWhatsAppTemplatePayload = {
  templateName?: unknown;
  templateLanguage?: unknown;
  templateComponents?: unknown;
};

const getStoredTemplatePayload = (payload: unknown) => {
  const stored = (payload && typeof payload === 'object' ? payload : {}) as StoredWhatsAppTemplatePayload;
  const templateName = typeof stored.templateName === 'string' ? stored.templateName : '';
  const templateLanguage = typeof stored.templateLanguage === 'string' ? stored.templateLanguage : 'en_US';
  if (!templateName) throw new Error('Stored WhatsApp template details are missing.');
  return {
    templateName,
    templateLanguage,
    templateComponents: Array.isArray(stored.templateComponents) ? stored.templateComponents : undefined,
  };
};

const deliverWhatsAppOutboxMessage = async (messageLogId: string) => {
  const messageLog = await prisma.whatsAppMessageLog.findUnique({
    where: { id: messageLogId },
    include: { outbox: true },
  });
  if (!messageLog?.outbox) throw new Error('WhatsApp outbox message not found.');
  if (messageLog.outbox.status === 'FAILED' && !canRetryWhatsAppOutbox(messageLog.outbox)) {
    throw new Error('This WhatsApp message has reached the retry limit.');
  }
  if (!['PENDING', 'FAILED'].includes(messageLog.outbox.status)) {
    throw new Error('This WhatsApp message is not ready for delivery.');
  }

  const { templateName, templateLanguage, templateComponents } = getStoredTemplatePayload(messageLog.outbox.payload);
  await prisma.$transaction([
    prisma.whatsAppMessageLog.update({ where: { id: messageLog.id }, data: { status: 'QUEUED', errorCode: null, errorMessage: null } }),
    prisma.whatsAppOutbox.update({
      where: { id: messageLog.outbox.id },
      data: { status: 'PROCESSING', attempts: { increment: 1 }, lockedAt: new Date(), lastError: null },
    }),
  ]);

  try {
    const settings = await getEnabledSettings();
    const accessToken = decryptWhatsAppCredential(settings.encryptedAccessToken!, credentialSecret());
    const { metaMessageId } = await sendWhatsAppTemplate({
      accessToken,
      phoneNumberId: settings.phoneNumberId!,
      graphApiVersion: graphApiVersion(settings.graphApiVersion),
    }, messageLog.recipientPhone, {
      name: templateName,
      language: templateLanguage,
      components: templateComponents,
    });
    await prisma.$transaction([
      prisma.whatsAppMessageLog.update({ where: { id: messageLog.id }, data: { status: 'SENT', sentAt: new Date(), metaMessageId } }),
      prisma.whatsAppOutbox.update({ where: { id: messageLog.outbox.id }, data: { status: 'SENT', processedAt: new Date(), lockedAt: null } }),
    ]);
    return { sent: true, messageLogId: messageLog.id };
  } catch (error) {
    const lastError = error instanceof Error ? error.message.slice(0, 1000) : 'Unable to send WhatsApp automation.';
    await prisma.$transaction([
      prisma.whatsAppMessageLog.update({ where: { id: messageLog.id }, data: { status: 'FAILED', errorMessage: lastError } }),
      prisma.whatsAppOutbox.update({ where: { id: messageLog.outbox.id }, data: { status: 'FAILED', lastError, processedAt: new Date(), lockedAt: null } }),
    ]);
    return { sent: false, messageLogId: messageLog.id, error: lastError };
  }
};

export const retryFailedWhatsAppMessage = async (messageLogId: string) => {
  const messageLog = await prisma.whatsAppMessageLog.findUnique({ where: { id: messageLogId }, include: { outbox: true } });
  if (!messageLog?.outbox) throw new Error('WhatsApp message was not found.');
  if (messageLog.status !== 'FAILED') throw new Error('Only failed WhatsApp messages can be retried.');
  if (!canRetryWhatsAppOutbox(messageLog.outbox)) throw new Error('This WhatsApp message has reached the retry limit.');
  return deliverWhatsAppOutboxMessage(messageLogId);
};

export const getWhatsAppMessageLogs = async ({
  status,
  eventCode,
  recipientType,
  limit = 50,
}: {
  status?: string;
  eventCode?: string;
  recipientType?: string;
  limit?: number;
}) => {
  const allowedStatuses = ['QUEUED', 'SENT', 'DELIVERED', 'READ', 'FAILED', 'SKIPPED'];
  const allowedRecipientTypes = ['CUSTOMER', 'PARTNER', 'SUPER_ADMIN', 'RECRUITER', 'CANDIDATE', 'TEST'];
  const logs = await prisma.whatsAppMessageLog.findMany({
    where: {
      ...(status && allowedStatuses.includes(status) ? { status: status as any } : {}),
      ...(recipientType && allowedRecipientTypes.includes(recipientType) ? { recipientType: recipientType as any } : {}),
      ...(eventCode ? { eventCode: { contains: eventCode.slice(0, 100), mode: 'insensitive' } } : {}),
    },
    orderBy: { createdAt: 'desc' },
    take: Math.min(100, Math.max(1, limit)),
    include: { outbox: { select: { attempts: true, status: true, processedAt: true, lastError: true } } },
  });
  return logs.map((log) => ({
    id: log.id,
    eventCode: log.eventCode,
    relatedEntityType: log.relatedEntityType,
    relatedEntityId: log.relatedEntityId,
    recipientType: log.recipientType,
    recipientPhone: maskPhone(log.recipientPhone),
    status: log.status,
    errorMessage: log.errorMessage,
    createdAt: log.createdAt,
    sentAt: log.sentAt,
    deliveredAt: log.deliveredAt,
    readAt: log.readAt,
    outbox: log.outbox ? { attempts: log.outbox.attempts, status: log.outbox.status, processedAt: log.outbox.processedAt, lastError: log.outbox.lastError } : null,
  }));
};

type AutomationDispatchInput = {
  eventCode: WhatsAppAutomationEvent;
  relatedEntityType: string;
  relatedEntityId: string;
  recipientType: WhatsAppRecipientType;
  recipientPhone?: string | null | undefined;
  templateComponents?: unknown;
  payloadSnapshot?: Record<string, unknown>;
};

const buildDedupeKey = (input: AutomationDispatchInput, recipientPhone: string) =>
  `${input.eventCode}:${input.relatedEntityType}:${input.relatedEntityId}:${input.recipientType}:${recipientPhone}`;

export const dispatchConfiguredWhatsApp = async (input: AutomationDispatchInput) => {
  try {
    const [settings, rule] = await Promise.all([
      prisma.whatsAppIntegrationSettings.findUnique({ where: { id: SETTINGS_ID } }),
      prisma.whatsAppAutomationRule.findUnique({
        where: { eventCode: input.eventCode },
        include: { template: true },
      }),
    ]);
    const decision = evaluateWhatsAppAutomation({
      integrationEnabled: Boolean(settings && isWhatsAppDeliveryAllowed({ integrationEnabled: settings.enabled, credentialsConfigured: hasEncryptedCredentials(settings) })),
      recipientPhone: input.recipientPhone,
      rule: rule
        ? {
          enabled: rule.enabled,
          templateId: rule.templateId,
          templateStatus: rule.template?.status || null,
          metaTemplateId: rule.template?.metaTemplateId || null,
        }
        : null,
    });

    if (!decision.shouldQueue || !settings || !rule?.template) {
      return { queued: false, reason: decision.shouldQueue ? 'AUTOMATION_CONFIGURATION_INVALID' : decision.reason };
    }

    const dedupeKey = buildDedupeKey(input, decision.recipientPhone);
    const existing = await prisma.whatsAppMessageLog.findUnique({ where: { dedupeKey } });
    if (existing) return { queued: false, duplicate: true, messageLogId: existing.id };

    const messageLog = await prisma.whatsAppMessageLog.create({
      data: {
        eventCode: input.eventCode,
        relatedEntityType: input.relatedEntityType,
        relatedEntityId: input.relatedEntityId,
        recipientType: input.recipientType,
        recipientPhone: decision.recipientPhone,
        dedupeKey,
        payloadSnapshot: {
          ...(input.payloadSnapshot || {}),
          templateId: rule.template.id,
          templateName: rule.template.name,
          templateLanguage: rule.template.language,
          templateComponents: input.templateComponents || [],
        },
        outbox: {
          create: {
            payload: {
              eventCode: input.eventCode,
              templateId: rule.template.id,
              templateName: rule.template.name,
              templateLanguage: rule.template.language,
              templateComponents: input.templateComponents || [],
            },
          },
        },
      },
      include: { outbox: true },
    });

    const delivery = await deliverWhatsAppOutboxMessage(messageLog.id);
    return { queued: true, ...delivery };
  } catch (error) {
    // Notification automation is deliberately isolated from product transactions.
    console.error(`WhatsApp automation failed for ${input.eventCode}:`, error);
    return { queued: false, reason: 'DISPATCH_ERROR' };
  }
};

export const dispatchMarketplaceWhatsApp = (input: Omit<AutomationDispatchInput, 'eventCode'> & { eventCode: MarketplaceWhatsAppEvent }) =>
  dispatchConfiguredWhatsApp(input);

export const dispatchRecruitmentWhatsApp = (input: Omit<AutomationDispatchInput, 'eventCode'> & { eventCode: RecruitmentWhatsAppEvent }) =>
  dispatchConfiguredWhatsApp(input);

export const dispatchApprovedWhatsAppTemplate = async ({
  eventCode,
  relatedEntityType,
  relatedEntityId,
  templateId,
  recipientType,
  recipientPhone,
  payloadSnapshot,
}: {
  eventCode: string;
  relatedEntityType: string;
  relatedEntityId: string;
  templateId: string;
  recipientType: WhatsAppRecipientType;
  recipientPhone: string;
  payloadSnapshot?: Record<string, unknown>;
}) => {
  if (!await isWhatsAppIntegrationEnabled()) {
    throw new Error('WhatsApp is disabled. Enable the global integration before sending a campaign.');
  }
  const phone = normalizeWhatsAppRecipientPhone(recipientPhone);
  if (!phone) throw new Error('Recipient WhatsApp phone number is invalid.');
  const template = await prisma.whatsAppMetaTemplate.findUnique({ where: { id: templateId } });
  if (!template || template.status !== 'APPROVED' || !template.metaTemplateId) {
    throw new Error('Campaign requires a Meta-approved template.');
  }
  const dedupeKey = `${eventCode}:${relatedEntityType}:${relatedEntityId}:${recipientType}:${phone}`;
  const existing = await prisma.whatsAppMessageLog.findUnique({ where: { dedupeKey } });
  if (existing) return { sent: false, duplicate: true, messageLogId: existing.id };
  const messageLog = await prisma.whatsAppMessageLog.create({
    data: {
      eventCode,
      relatedEntityType,
      relatedEntityId,
      recipientType,
      recipientPhone: phone,
      dedupeKey,
      payloadSnapshot: { ...(payloadSnapshot || {}), templateId: template.id, templateName: template.name, templateLanguage: template.language, templateComponents: [] },
      outbox: { create: { payload: { eventCode, templateId: template.id, templateName: template.name, templateLanguage: template.language, templateComponents: [] } } },
    },
  });
  return deliverWhatsAppOutboxMessage(messageLog.id);
};

export const sendWhatsAppTestMessage = async ({ message, actorUserId }: { message: string; actorUserId: string }) => {
  const text = message.trim();
  if (!text || text.length > MAX_TEST_MESSAGE_LENGTH) {
    throw new Error(`Test message must be between 1 and ${MAX_TEST_MESSAGE_LENGTH} characters.`);
  }

  const settings = await getEnabledSettings();
  if (!settings.testRecipientPhone) {
    throw new Error('Save a test recipient phone number before sending a test message.');
  }

  const log = await prisma.whatsAppMessageLog.create({
    data: {
      eventCode: 'SYSTEM_TEST',
      relatedEntityType: 'WHATSAPP_SETTINGS',
      relatedEntityId: SETTINGS_ID,
      recipientType: 'TEST',
      recipientPhone: settings.testRecipientPhone,
      payloadSnapshot: { initiatedByUserId: actorUserId },
    },
  });

  try {
    const accessToken = decryptWhatsAppCredential(settings.encryptedAccessToken!, credentialSecret());
    const { metaMessageId } = await sendWhatsAppText({
      accessToken,
      phoneNumberId: settings.phoneNumberId!,
      graphApiVersion: graphApiVersion(settings.graphApiVersion),
    }, settings.testRecipientPhone, text);
    await prisma.whatsAppMessageLog.update({
      where: { id: log.id },
      data: { status: 'SENT', sentAt: new Date(), metaMessageId },
    });
    return { id: log.id, status: 'SENT' as const };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message.slice(0, 1000) : 'Unable to send test message.';
    await prisma.whatsAppMessageLog.update({
      where: { id: log.id },
      data: { status: 'FAILED', errorMessage },
    });
    throw new Error(errorMessage);
  }
};

export const verifyWhatsAppWebhookToken = async (token: string) => {
  const settings = await prisma.whatsAppIntegrationSettings.findUnique({ where: { id: SETTINGS_ID } });
  if (!settings?.encryptedWebhookVerifyToken) return false;

  try {
    const expected = decryptWhatsAppCredential(settings.encryptedWebhookVerifyToken, credentialSecret());
    const expectedBuffer = Buffer.from(expected);
    const receivedBuffer = Buffer.from(token);
    return expectedBuffer.length === receivedBuffer.length && crypto.timingSafeEqual(expectedBuffer, receivedBuffer);
  } catch {
    return false;
  }
};

export const verifyWhatsAppWebhookSignature = async (rawBody: Buffer, signature?: string) => {
  const settings = await prisma.whatsAppIntegrationSettings.findUnique({ where: { id: SETTINGS_ID } });
  if (!settings?.encryptedAppSecret || !signature?.startsWith('sha256=')) return false;

  try {
    const appSecret = decryptWhatsAppCredential(settings.encryptedAppSecret, credentialSecret());
    const expected = `sha256=${crypto.createHmac('sha256', appSecret).update(rawBody).digest('hex')}`;
    const expectedBuffer = Buffer.from(expected);
    const receivedBuffer = Buffer.from(signature);
    return expectedBuffer.length === receivedBuffer.length && crypto.timingSafeEqual(expectedBuffer, receivedBuffer);
  } catch {
    return false;
  }
};

type WhatsAppWebhookStatus = {
  id?: string;
  status?: string;
  timestamp?: string;
  errors?: Array<{ code?: number; title?: string }>;
};

type WhatsAppWebhookPayload = {
  entry?: Array<{ changes?: Array<{ value?: { statuses?: WhatsAppWebhookStatus[] } }> }>;
};

export const applyWhatsAppWebhookStatuses = async (payload: unknown) => {
  const entries = (payload as WhatsAppWebhookPayload).entry || [];
  const statusUpdates = entries.flatMap((entry) => entry.changes || []).flatMap((change) => change.value?.statuses || []);

  await Promise.all(statusUpdates.map(async (status) => {
    if (!status.id || !['sent', 'delivered', 'read', 'failed'].includes(status.status || '')) return;
    const timestamp = status.timestamp ? new Date(Number(status.timestamp) * 1000) : new Date();
    const mappedStatus = status.status === 'sent' ? 'SENT' : status.status === 'delivered' ? 'DELIVERED' : status.status === 'read' ? 'READ' : 'FAILED';
    await prisma.whatsAppMessageLog.updateMany({
      where: { metaMessageId: status.id },
      data: {
        status: mappedStatus,
        ...(mappedStatus === 'SENT' ? { sentAt: timestamp } : {}),
        ...(mappedStatus === 'DELIVERED' ? { deliveredAt: timestamp } : {}),
        ...(mappedStatus === 'READ' ? { readAt: timestamp } : {}),
        ...(mappedStatus === 'FAILED'
          ? { errorCode: status.errors?.[0]?.code ? String(status.errors[0].code) : null, errorMessage: status.errors?.[0]?.title || 'Meta delivery failed.' }
          : {}),
      },
    });
  }));
};
