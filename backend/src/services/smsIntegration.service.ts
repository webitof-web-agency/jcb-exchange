import { Prisma } from '@prisma/client';
import prisma from '../lib/prisma';
import {
  canRetrySmsOutbox,
  decryptSmsCredential,
  encryptSmsCredential,
  evaluateSmsAutomation,
  normalizeSmsRecipientPhone,
  renderSmsVariables,
  resolveSmsTestRecipientPhone,
  sendDltSms,
  getSmsPublishedBroadcastRecipientType,
  type SmsPublishedBroadcastEvent,
} from '../modules/sms-core';
import { getSmsPublishedBroadcastRecipients } from './smsAudience.service';

const SETTINGS_ID = 'default';
const MASKED_SECRET = '********';

export const marketplaceSmsEvents = [
  'PARTNER_KYC_STATUS_UPDATED',
  'PARTNER_LISTING_STATUS_UPDATED',
  'LISTING_PAYMENT_SUBMITTED',
  'LISTING_PAYMENT_APPROVED',
  'LISTING_PAYMENT_REJECTED',
  'CUSTOMER_PRIME_APPROVED',
  'CUSTOMER_PRIME_REJECTED',
  'MARKETPLACE_NEW_LISTING_PUBLISHED',
] as const;

export type MarketplaceSmsEvent = (typeof marketplaceSmsEvents)[number];

export const recruitmentSmsEvents = [
  'RECRUITMENT_APPLICATION_RECEIVED',
  'RECRUITMENT_NEW_APPLICATION_SUPERADMIN',
  'RECRUITMENT_NEW_APPLICATION_RECRUITER',
  'RECRUITMENT_APPLICATION_STAGE_UPDATED',
  'RECRUITMENT_INTERVIEW_SCHEDULED',
  'RECRUITMENT_INTERVIEW_RESCHEDULED',
  'RECRUITMENT_INTERVIEW_CANCELLED',
  'RECRUITMENT_OFFER_SENT',
  'RECRUITMENT_OFFER_STATUS_UPDATED',
  'RECRUITMENT_NEW_JOB_PUBLISHED',
] as const;

export type RecruitmentSmsEvent = (typeof recruitmentSmsEvents)[number];
type SmsAutomationEvent = MarketplaceSmsEvent | RecruitmentSmsEvent;

type SmsSettingsInput = {
  enabled?: boolean;
  apiKey?: string;
  baseUrl?: string;
  senderId?: string;
  testRecipientPhone?: string;
  smsDetails?: '0' | '1';
  updatedByUserId: string;
};

const getCredentialSecret = () => {
  const secret = process.env.SMS_SETTINGS_SECRET?.trim() || process.env.WHATSAPP_SETTINGS_SECRET?.trim();
  if (!secret) throw new Error('SMS_SETTINGS_SECRET is required before SMS credentials can be saved.');
  return secret;
};

const hasUsableCredentialSecret = () => /^[a-fA-F0-9]{64}$/.test((process.env.SMS_SETTINGS_SECRET?.trim() || process.env.WHATSAPP_SETTINGS_SECRET?.trim() || ''));

const normalizeBaseUrl = (value?: string | null) => {
  const candidate = value?.trim() || 'https://sms.flowitof.com/dev';
  let parsed: URL;
  try {
    parsed = new URL(candidate);
  } catch {
    throw new Error('SMS provider base URL must be a valid HTTP or HTTPS URL.');
  }
  if (!['http:', 'https:'].includes(parsed.protocol)) throw new Error('SMS provider base URL must use HTTP or HTTPS.');
  return candidate.replace(/\/+$/, '');
};

const normalizeSenderId = (value?: string | null) => {
  const senderId = value?.trim().toUpperCase() || '';
  if (senderId && !/^[A-Z0-9]{3,6}$/.test(senderId)) throw new Error('DLT Sender ID must contain 3 to 6 letters or numbers.');
  return senderId || null;
};

const maskPhone = (value?: string | null) => {
  if (!value) return '';
  return `${'*'.repeat(Math.max(0, value.length - 4))}${value.slice(-4)}`;
};

const serializeSettings = (settings: {
  enabled: boolean;
  baseUrl: string;
  senderId: string | null;
  testRecipientPhone: string | null;
  smsDetails: string;
  encryptedApiKey: string | null;
  updatedAt: Date;
}) => ({
  enabled: settings.enabled,
  ready: Boolean(settings.senderId && settings.encryptedApiKey && hasUsableCredentialSecret()),
  baseUrl: settings.baseUrl,
  senderId: settings.senderId || '',
  testRecipientPhoneMasked: maskPhone(settings.testRecipientPhone),
  smsDetails: settings.smsDetails,
  credentials: { apiKeyConfigured: Boolean(settings.encryptedApiKey) },
  updatedAt: settings.updatedAt,
});

export const getSmsSettings = async () => {
  const settings = await prisma.smsIntegrationSettings.upsert({
    where: { id: SETTINGS_ID },
    update: {},
    create: { id: SETTINGS_ID },
  });
  return serializeSettings(settings);
};

export const updateSmsSettings = async (input: SmsSettingsInput) => {
  const current = await prisma.smsIntegrationSettings.upsert({
    where: { id: SETTINGS_ID },
    update: {},
    create: { id: SETTINGS_ID },
  });
  const apiKey = input.apiKey?.trim();
  const secret = apiKey && apiKey !== MASKED_SECRET ? getCredentialSecret() : null;
  const encryptedApiKey = secret ? encryptSmsCredential(apiKey!, secret) : current.encryptedApiKey;
  const nextSenderId = input.senderId === undefined ? current.senderId : normalizeSenderId(input.senderId);
  const nextSettings = {
    senderId: nextSenderId,
    encryptedApiKey,
  };
  const enabled = input.enabled === undefined ? current.enabled : input.enabled;
  if (enabled && (!nextSettings.senderId || !nextSettings.encryptedApiKey || !hasUsableCredentialSecret())) {
    throw new Error('Add the SMS API key and DLT Sender ID before enabling SMS notifications.');
  }
  const testRecipientPhone = input.testRecipientPhone === undefined
    ? current.testRecipientPhone
    : resolveSmsTestRecipientPhone(input.testRecipientPhone, current.testRecipientPhone);
  if (input.testRecipientPhone?.trim() && !testRecipientPhone) throw new Error('Enter a valid 10-digit Indian test mobile number.');

  const settings = await prisma.smsIntegrationSettings.update({
    where: { id: SETTINGS_ID },
    data: {
      enabled,
      baseUrl: input.baseUrl === undefined ? current.baseUrl : normalizeBaseUrl(input.baseUrl),
      senderId: nextSenderId,
      testRecipientPhone,
      smsDetails: input.smsDetails === undefined ? current.smsDetails : input.smsDetails,
      encryptedApiKey,
      updatedByUserId: input.updatedByUserId,
    },
  });
  return serializeSettings(settings);
};

const getSmsAutomationConfiguration = async (eventCodes: readonly SmsAutomationEvent[]) => {
  const existingRules = await prisma.smsAutomationRule.findMany({
    where: { eventCode: { in: [...eventCodes] } },
    select: { id: true, eventCode: true, enabled: true, messageId: true, variablesTemplate: true, recipientPolicy: true, updatedAt: true },
  });
  const byEvent = new Map(existingRules.map((rule) => [rule.eventCode, rule]));
  return {
    rules: eventCodes.map((eventCode) => byEvent.get(eventCode) || {
      id: null,
      eventCode,
      enabled: false,
      messageId: null,
      variablesTemplate: '',
      recipientPolicy: null,
      updatedAt: null,
    }),
  };
};

export const getMarketplaceSmsAutomationConfiguration = () => getSmsAutomationConfiguration(marketplaceSmsEvents);
export const getRecruitmentSmsAutomationConfiguration = () => getSmsAutomationConfiguration(recruitmentSmsEvents);

const saveSmsAutomationRule = async ({ eventCode, enabled, messageId, variablesTemplate }: {
  eventCode: SmsAutomationEvent;
  enabled: boolean;
  messageId?: string | null;
  variablesTemplate?: string | null;
}) => {
  const normalizedMessageId = messageId?.trim() || null;
  if (normalizedMessageId && (!/^\d+$/.test(normalizedMessageId) || normalizedMessageId.length > 30)) {
    throw new Error('DLT Message ID must contain digits only.');
  }
  const normalizedVariables = variablesTemplate?.trim() || null;
  if (normalizedVariables && normalizedVariables.length > 1000) throw new Error('SMS variable mapping is too long.');
  if (enabled && !normalizedMessageId) throw new Error('Enter the approved DLT Message ID before enabling this SMS rule.');
  return prisma.smsAutomationRule.upsert({
    where: { eventCode },
    update: { enabled, messageId: normalizedMessageId, variablesTemplate: normalizedVariables },
    create: { eventCode, enabled, messageId: normalizedMessageId, variablesTemplate: normalizedVariables },
  });
};

export const saveMarketplaceSmsAutomationRule = (input: { eventCode: MarketplaceSmsEvent; enabled: boolean; messageId?: string | null; variablesTemplate?: string | null }) => saveSmsAutomationRule(input);
export const saveRecruitmentSmsAutomationRule = (input: { eventCode: RecruitmentSmsEvent; enabled: boolean; messageId?: string | null; variablesTemplate?: string | null }) => saveSmsAutomationRule(input);

const hasSmsCredentials = (settings: { enabled: boolean; senderId: string | null; encryptedApiKey: string | null }) =>
  settings.enabled && Boolean(settings.senderId && settings.encryptedApiKey && hasUsableCredentialSecret());

const getEnabledSmsSettings = async () => {
  const settings = await prisma.smsIntegrationSettings.findUnique({ where: { id: SETTINGS_ID } });
  if (!settings || !hasSmsCredentials(settings)) throw new Error('SMS is not configured and enabled yet.');
  return settings;
};

const getStoredPayload = (payload: unknown) => {
  const stored = (payload && typeof payload === 'object' ? payload : {}) as { messageId?: unknown; variablesTemplate?: unknown; payloadSnapshot?: unknown };
  if (typeof stored.messageId !== 'string' || !stored.messageId) throw new Error('Stored SMS message details are missing.');
  return {
    messageId: stored.messageId,
    variablesTemplate: typeof stored.variablesTemplate === 'string' ? stored.variablesTemplate : '',
    payloadSnapshot: stored.payloadSnapshot && typeof stored.payloadSnapshot === 'object' && !Array.isArray(stored.payloadSnapshot)
      ? stored.payloadSnapshot as Record<string, unknown>
      : {},
  };
};

const deliverSmsOutboxMessage = async (messageLogId: string) => {
  const messageLog = await prisma.smsMessageLog.findUnique({ where: { id: messageLogId }, include: { outbox: true } });
  if (!messageLog?.outbox) throw new Error('SMS outbox message not found.');
  if (messageLog.outbox.status === 'FAILED' && !canRetrySmsOutbox(messageLog.outbox)) throw new Error('This SMS message has reached the retry limit.');
  if (!['PENDING', 'FAILED'].includes(messageLog.outbox.status)) throw new Error('This SMS message is not ready for delivery.');
  const stored = getStoredPayload(messageLog.outbox.payload);
  await prisma.$transaction([
    prisma.smsMessageLog.update({ where: { id: messageLog.id }, data: { status: 'QUEUED', errorCode: null, errorMessage: null } }),
    prisma.smsOutbox.update({ where: { id: messageLog.outbox.id }, data: { status: 'PROCESSING', attempts: { increment: 1 }, lockedAt: new Date(), lastError: null } }),
  ]);
  try {
    const settings = await getEnabledSmsSettings();
    const apiKey = decryptSmsCredential(settings.encryptedApiKey!, getCredentialSecret());
    const result = await sendDltSms({
      baseUrl: settings.baseUrl,
      apiKey,
      senderId: settings.senderId!,
      messageId: stored.messageId,
      numbers: messageLog.recipientPhone,
      variablesValues: renderSmsVariables(stored.variablesTemplate, stored.payloadSnapshot),
      smsDetails: settings.smsDetails === '1' ? '1' : '0',
    });
    await prisma.$transaction([
      prisma.smsMessageLog.update({ where: { id: messageLog.id }, data: { status: 'SENT', sentAt: new Date(), providerMessageId: result.providerMessageId } }),
      prisma.smsOutbox.update({ where: { id: messageLog.outbox.id }, data: { status: 'SENT', processedAt: new Date(), lockedAt: null } }),
    ]);
    return { sent: true, messageLogId: messageLog.id };
  } catch (error) {
    const lastError = error instanceof Error ? error.message.slice(0, 1000) : 'Unable to send SMS automation.';
    await prisma.$transaction([
      prisma.smsMessageLog.update({ where: { id: messageLog.id }, data: { status: 'FAILED', errorMessage: lastError } }),
      prisma.smsOutbox.update({ where: { id: messageLog.outbox.id }, data: { status: 'FAILED', lastError, processedAt: new Date(), lockedAt: null } }),
    ]);
    return { sent: false, messageLogId: messageLog.id, error: lastError };
  }
};

export const retryFailedSmsMessage = async (messageLogId: string) => {
  const messageLog = await prisma.smsMessageLog.findUnique({ where: { id: messageLogId }, include: { outbox: true } });
  if (!messageLog?.outbox) throw new Error('SMS message was not found.');
  if (messageLog.status !== 'FAILED') throw new Error('Only failed SMS messages can be retried.');
  if (!canRetrySmsOutbox(messageLog.outbox)) throw new Error('This SMS message has reached the retry limit.');
  return deliverSmsOutboxMessage(messageLogId);
};

export const getSmsMessageLogs = async ({ status, eventCode, recipientType, limit = 50 }: { status?: string; eventCode?: string; recipientType?: string; limit?: number }) => {
  const allowedStatuses = ['QUEUED', 'SENT', 'FAILED', 'SKIPPED'];
  const logs = await prisma.smsMessageLog.findMany({
    where: {
      ...(status && allowedStatuses.includes(status) ? { status: status as 'QUEUED' | 'SENT' | 'FAILED' | 'SKIPPED' } : {}),
      ...(recipientType ? { recipientType } : {}),
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
    outbox: log.outbox ? { attempts: log.outbox.attempts, status: log.outbox.status, processedAt: log.outbox.processedAt, lastError: log.outbox.lastError } : null,
  }));
};

type SmsDispatchInput = {
  eventCode: SmsAutomationEvent;
  relatedEntityType: string;
  relatedEntityId: string;
  recipientType: string;
  recipientPhone?: string | null;
  payloadSnapshot?: Record<string, unknown>;
};

const buildDedupeKey = (input: SmsDispatchInput, recipientPhone: string) => `sms:${input.eventCode}:${input.relatedEntityType}:${input.relatedEntityId}:${input.recipientType}:${recipientPhone}`;

export const dispatchConfiguredSms = async (input: SmsDispatchInput) => {
  try {
    const [settings, rule] = await Promise.all([
      prisma.smsIntegrationSettings.findUnique({ where: { id: SETTINGS_ID } }),
      prisma.smsAutomationRule.findUnique({ where: { eventCode: input.eventCode } }),
    ]);
    const decision = evaluateSmsAutomation({
      integrationEnabled: Boolean(settings && hasSmsCredentials(settings)),
      recipientPhone: input.recipientPhone,
      rule: rule ? { enabled: rule.enabled, messageId: rule.messageId } : null,
    });
    if (!decision.shouldQueue || !rule?.messageId) return { queued: false, reason: decision.shouldQueue ? 'MESSAGE_ID_REQUIRED' : decision.reason };
    const dedupeKey = buildDedupeKey(input, decision.recipientPhone);
    const existing = await prisma.smsMessageLog.findUnique({ where: { dedupeKey } });
    if (existing) return { queued: false, duplicate: true, messageLogId: existing.id };
    const messageLog = await prisma.smsMessageLog.create({
      data: {
        eventCode: input.eventCode,
        relatedEntityType: input.relatedEntityType,
        relatedEntityId: input.relatedEntityId,
        recipientType: input.recipientType,
        recipientPhone: decision.recipientPhone,
        dedupeKey,
        payloadSnapshot: (input.payloadSnapshot || {}) as Prisma.InputJsonValue,
        outbox: {
          create: {
            payload: {
              eventCode: input.eventCode,
              messageId: rule.messageId,
              variablesTemplate: rule.variablesTemplate || '',
              payloadSnapshot: (input.payloadSnapshot || {}) as Prisma.InputJsonValue,
            },
          },
        },
      },
      include: { outbox: true },
    });
    const delivery = await deliverSmsOutboxMessage(messageLog.id);
    return { queued: true, ...delivery };
  } catch (error) {
    console.error(`SMS automation failed for ${input.eventCode}:`, error);
    return { queued: false, reason: 'DISPATCH_ERROR' };
  }
};

export const dispatchMarketplaceSms = (input: Omit<SmsDispatchInput, 'eventCode'> & { eventCode: MarketplaceSmsEvent }) => dispatchConfiguredSms(input);
export const dispatchRecruitmentSms = (input: Omit<SmsDispatchInput, 'eventCode'> & { eventCode: RecruitmentSmsEvent }) => dispatchConfiguredSms(input);

export const dispatchPublishedSms = async ({
  eventCode,
  relatedEntityType,
  relatedEntityId,
  payloadSnapshot,
}: {
  eventCode: SmsPublishedBroadcastEvent;
  relatedEntityType: string;
  relatedEntityId: string;
  payloadSnapshot?: Record<string, unknown>;
}) => {
  try {
    const audience = eventCode === 'MARKETPLACE_NEW_LISTING_PUBLISHED' ? 'MARKETPLACE' as const : 'RECRUITMENT' as const;
    const recipientType = getSmsPublishedBroadcastRecipientType(eventCode);
    const recipients = await getSmsPublishedBroadcastRecipients(audience);
    const results = await Promise.all(recipients.map((recipient) => dispatchConfiguredSms({
      eventCode,
      relatedEntityType,
      relatedEntityId,
      recipientType,
      recipientPhone: recipient.recipientPhone,
      payloadSnapshot: {
        ...(payloadSnapshot || {}),
        sourceEntityType: recipient.sourceEntityType,
        sourceEntityId: recipient.sourceEntityId,
      },
    })));
    return {
      audienceCount: recipients.length,
      queuedCount: results.filter((result) => result.queued).length,
      skippedCount: results.filter((result) => !result.queued).length,
    };
  } catch (error) {
    console.error(`SMS published broadcast failed for ${eventCode}:`, error);
    return { audienceCount: 0, queuedCount: 0, skippedCount: 0 };
  }
};

export const sendSmsTestMessage = async ({ messageId, variablesValues, actorUserId }: { messageId: string; variablesValues?: string; actorUserId: string }) => {
  const settings = await getEnabledSmsSettings();
  const recipientPhone = normalizeSmsRecipientPhone(settings.testRecipientPhone);
  if (!recipientPhone) throw new Error('Save a valid test recipient number before sending a test SMS.');
  if (!/^\d+$/.test(messageId.trim())) throw new Error('DLT Message ID must contain digits only.');
  const messageLog = await prisma.smsMessageLog.create({
    data: {
      eventCode: 'SMS_TEST',
      relatedEntityType: 'SMS_SETTINGS',
      relatedEntityId: actorUserId,
      recipientType: 'TEST',
      recipientPhone,
      payloadSnapshot: { messageId: messageId.trim(), variablesValues: variablesValues || '' },
      outbox: { create: { payload: { messageId: messageId.trim(), variablesTemplate: variablesValues || '', payloadSnapshot: {} } } },
    },
  });
  return deliverSmsOutboxMessage(messageLog.id);
};
