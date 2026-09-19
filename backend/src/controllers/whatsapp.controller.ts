import type { NextFunction, Request, Response } from 'express';
import prisma from '../lib/prisma';
import { buildWhatsAppWebhookUrl, isWhatsAppTemplatePurpose, type WhatsAppTemplatePurpose } from '../modules/whatsapp-core';
import {
  confirmWhatsAppCampaign,
  createWhatsAppCampaign,
  createWhatsAppReminderCampaign,
  listWhatsAppCampaigns,
  saveWhatsAppConsent,
} from '../services/whatsappCampaign.service';
import {
  getWhatsAppMessageLogs,
  getWhatsAppMetaTemplates,
  getWhatsAppSettings,
  getMarketplaceWhatsAppAutomationConfiguration,
  getRecruitmentWhatsAppAutomationConfiguration,
  marketplaceWhatsAppEvents,
  recruitmentWhatsAppEvents,
  retryFailedWhatsAppMessage,
  saveMarketplaceWhatsAppAutomationRule,
  saveRecruitmentWhatsAppAutomationRule,
  saveWhatsAppMetaTemplate,
  sendWhatsAppTestMessage,
  updateWhatsAppSettings,
} from '../services/whatsappIntegration.service';

const getRuntimePublicApiUrl = (req: Request) => {
  const configured = process.env.WHATSAPP_PUBLIC_API_URL?.trim();
  if (configured) return configured;
  const forwardedHost = String(req.headers['x-forwarded-host'] || '').split(',')[0]?.trim() || '';
  const host = forwardedHost || req.get('host');
  if (!host) throw new Error('Unable to determine the public API URL for the WhatsApp webhook.');
  const forwardedProtocol = String(req.headers['x-forwarded-proto'] || '').split(',')[0]?.trim().toLowerCase() || '';
  const protocol = forwardedProtocol === 'https' || forwardedProtocol === 'http' ? forwardedProtocol : req.protocol;
  return `${protocol}://${host}`;
};

const getWebhookUrl = (req: Request) => buildWhatsAppWebhookUrl(getRuntimePublicApiUrl(req));

const asOptionalString = (value: unknown, field: string, maxLength = 500) => {
  if (value === undefined) return undefined;
  if (typeof value !== 'string' || value.length > maxLength) {
    throw new Error(`${field} must be a text value up to ${maxLength} characters.`);
  }
  return value;
};

export const getWhatsAppConfiguration = async (req: Request, res: Response, next: NextFunction) => {
  try {
    res.json({ settings: await getWhatsAppSettings(), webhookUrl: getWebhookUrl(req) });
  } catch (error) {
    next(error);
  }
};

export const saveWhatsAppConfiguration = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const body = req.body as Record<string, unknown>;
    if (body.enabled !== undefined && typeof body.enabled !== 'boolean') {
      return res.status(400).json({ error: 'enabled must be true or false.' });
    }

    const settings = await updateWhatsAppSettings({
      ...(body.enabled !== undefined ? { enabled: body.enabled as boolean } : {}),
      ...(asOptionalString(body.graphApiVersion, 'graphApiVersion', 20) !== undefined ? { graphApiVersion: asOptionalString(body.graphApiVersion, 'graphApiVersion', 20)! } : {}),
      ...(asOptionalString(body.phoneNumberId, 'phoneNumberId', 100) !== undefined ? { phoneNumberId: asOptionalString(body.phoneNumberId, 'phoneNumberId', 100)! } : {}),
      ...(asOptionalString(body.businessAccountId, 'businessAccountId', 100) !== undefined ? { businessAccountId: asOptionalString(body.businessAccountId, 'businessAccountId', 100)! } : {}),
      ...(asOptionalString(body.testRecipientPhone, 'testRecipientPhone', 32) !== undefined ? { testRecipientPhone: asOptionalString(body.testRecipientPhone, 'testRecipientPhone', 32)! } : {}),
      ...(asOptionalString(body.accessToken, 'accessToken', 4096) !== undefined ? { accessToken: asOptionalString(body.accessToken, 'accessToken', 4096)! } : {}),
      ...(asOptionalString(body.webhookVerifyToken, 'webhookVerifyToken', 256) !== undefined ? { webhookVerifyToken: asOptionalString(body.webhookVerifyToken, 'webhookVerifyToken', 256)! } : {}),
      ...(asOptionalString(body.appSecret, 'appSecret', 256) !== undefined ? { appSecret: asOptionalString(body.appSecret, 'appSecret', 256)! } : {}),
      updatedByUserId: req.user!.id,
    });

    res.json({ message: 'WhatsApp configuration saved.', settings });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to save WhatsApp configuration.';
    res.status(400).json({ error: message });
  }
};

export const getWhatsAppDashboard = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const since = new Date();
    since.setDate(since.getDate() - 7);
    const [settings, totalMessages, sentLast7Days, deliveredLast7Days, failedLast7Days, recentMessages] = await Promise.all([
      getWhatsAppSettings(),
      prisma.whatsAppMessageLog.count(),
      prisma.whatsAppMessageLog.count({ where: { status: { in: ['SENT', 'DELIVERED', 'READ'] }, createdAt: { gte: since } } }),
      prisma.whatsAppMessageLog.count({ where: { status: { in: ['DELIVERED', 'READ'] }, createdAt: { gte: since } } }),
      prisma.whatsAppMessageLog.count({ where: { status: 'FAILED', createdAt: { gte: since } } }),
      prisma.whatsAppMessageLog.findMany({ orderBy: { createdAt: 'desc' }, take: 8, select: { id: true, eventCode: true, recipientType: true, recipientPhone: true, status: true, errorMessage: true, createdAt: true } }),
    ]);

    res.json({
      settings,
      webhookUrl: getWebhookUrl(req),
      stats: { totalMessages, sentLast7Days, deliveredLast7Days, failedLast7Days },
      recentMessages: recentMessages.map((message) => ({
        ...message,
        recipientPhone: `${'*'.repeat(Math.max(0, message.recipientPhone.length - 4))}${message.recipientPhone.slice(-4)}`,
      })),
    });
  } catch (error) {
    next(error);
  }
};

export const sendWhatsAppConfigurationTest = async (req: Request, res: Response) => {
  try {
    const message = typeof req.body?.message === 'string' ? req.body.message : '';
    const result = await sendWhatsAppTestMessage({ message, actorUserId: req.user!.id });
    res.json({ message: 'Test message submitted to WhatsApp.', result });
  } catch (error) {
    res.status(400).json({ error: error instanceof Error ? error.message : 'Unable to send WhatsApp test message.' });
  }
};

export const getWhatsAppLogs = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const status = typeof req.query.status === 'string' ? req.query.status.toUpperCase() : undefined;
    const recipientType = typeof req.query.recipientType === 'string' ? req.query.recipientType.toUpperCase() : undefined;
    const eventCode = typeof req.query.eventCode === 'string' ? req.query.eventCode.trim() : undefined;
    const rawLimit = Number.parseInt(String(req.query.limit || '50'), 10);
    const allowedStatuses = new Set(['QUEUED', 'SENT', 'DELIVERED', 'READ', 'FAILED', 'SKIPPED']);
    const allowedRecipients = new Set(['CUSTOMER', 'PARTNER', 'SUPER_ADMIN', 'RECRUITER', 'CANDIDATE', 'TEST']);
    if (status && !allowedStatuses.has(status)) return res.status(400).json({ error: 'Invalid WhatsApp log status filter.' });
    if (recipientType && !allowedRecipients.has(recipientType)) return res.status(400).json({ error: 'Invalid WhatsApp recipient filter.' });
    if (eventCode && eventCode.length > 100) return res.status(400).json({ error: 'Event filter is too long.' });
    const logs = await getWhatsAppMessageLogs({
      ...(status ? { status } : {}),
      ...(recipientType ? { recipientType } : {}),
      ...(eventCode ? { eventCode } : {}),
      limit: Number.isFinite(rawLimit) ? rawLimit : 50,
    });
    res.json({ logs });
  } catch (error) {
    next(error);
  }
};

export const retryWhatsAppLog = async (req: Request, res: Response) => {
  try {
    const id = typeof req.params.id === 'string' ? req.params.id.trim() : '';
    if (!id || id.length > 100) return res.status(400).json({ error: 'Valid WhatsApp message id is required.' });
    const result = await retryFailedWhatsAppMessage(id);
    res.json({ message: result.sent ? 'WhatsApp message retry sent.' : 'WhatsApp retry attempted but Meta did not accept it.', result });
  } catch (error) {
    res.status(400).json({ error: error instanceof Error ? error.message : 'Unable to retry WhatsApp message.' });
  }
};

export const getWhatsAppCampaigns = async (_req: Request, res: Response, next: NextFunction) => {
  try {
    res.json({ campaigns: await listWhatsAppCampaigns() });
  } catch (error) {
    next(error);
  }
};

export const getWhatsAppTemplates = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const purpose = typeof req.query.purpose === 'string' ? req.query.purpose.toUpperCase() : undefined;
    if (purpose && !isWhatsAppTemplatePurpose(purpose)) {
      return res.status(400).json({ error: 'Invalid WhatsApp template purpose.' });
    }
    res.json({ templates: await getWhatsAppMetaTemplates(purpose as WhatsAppTemplatePurpose | undefined) });
  } catch (error) {
    next(error);
  }
};

export const saveWhatsAppCampaignConsent = async (req: Request, res: Response) => {
  try {
    const { phone, category, optedIn } = req.body as Record<string, unknown>;
    if (typeof phone !== 'string' || typeof optedIn !== 'boolean' || !['MARKETING', 'JOB_ALERTS'].includes(String(category))) {
      return res.status(400).json({ error: 'Valid phone, consent category, and optedIn value are required.' });
    }
    const consent = await saveWhatsAppConsent({ phone, category: category as 'MARKETING' | 'JOB_ALERTS', optedIn, actorUserId: req.user!.id });
    res.json({ message: optedIn ? 'WhatsApp consent saved.' : 'WhatsApp consent revoked.', consent });
  } catch (error) {
    res.status(400).json({ error: error instanceof Error ? error.message : 'Unable to save WhatsApp consent.' });
  }
};

export const createWhatsAppCampaignDraft = async (req: Request, res: Response) => {
  try {
    const { name, category, templateId } = req.body as Record<string, unknown>;
    if (typeof name !== 'string' || typeof templateId !== 'string' || !['MARKETING', 'JOB_ALERTS'].includes(String(category))) {
      return res.status(400).json({ error: 'Campaign name, category, and approved template are required.' });
    }
    const campaign = await createWhatsAppCampaign({ name, category: category as 'MARKETING' | 'JOB_ALERTS', templateId, actorUserId: req.user!.id });
    res.status(201).json({ message: 'Campaign draft created. Review recipients, then confirm to send.', campaign });
  } catch (error) {
    res.status(400).json({ error: error instanceof Error ? error.message : 'Unable to create campaign draft.' });
  }
};

export const confirmWhatsAppCampaignDraft = async (req: Request, res: Response) => {
  try {
    const id = typeof req.params.id === 'string' ? req.params.id.trim() : '';
    if (!id || id.length > 100) return res.status(400).json({ error: 'Valid campaign id is required.' });
    const campaign = await confirmWhatsAppCampaign({ campaignId: id, actorUserId: req.user!.id });
    res.json({ message: 'Campaign confirmation completed.', campaign });
  } catch (error) {
    res.status(400).json({ error: error instanceof Error ? error.message : 'Unable to confirm campaign.' });
  }
};

export const createWhatsAppReminderCampaignDraft = async (req: Request, res: Response) => {
  try {
    const { kind, templateId } = req.body as Record<string, unknown>;
    if (typeof templateId !== 'string' || !['INTERVIEW_48_HOURS', 'PRIME_EXPIRY_7_DAYS'].includes(String(kind))) {
      return res.status(400).json({ error: 'Valid reminder type and approved template are required.' });
    }
    const windowValue = req.body.windowValue === undefined ? undefined : Number(req.body.windowValue);
    if (windowValue !== undefined && !Number.isInteger(windowValue)) {
      return res.status(400).json({ error: 'Reminder window must be a whole number.' });
    }
    const campaign = await createWhatsAppReminderCampaign({
      kind: kind as 'INTERVIEW_48_HOURS' | 'PRIME_EXPIRY_7_DAYS',
      templateId,
      actorUserId: req.user!.id,
      ...(windowValue === undefined ? {} : { windowValue }),
    });
    res.status(201).json({ message: 'Reminder draft created. Confirm it separately to send.', campaign });
  } catch (error) {
    res.status(400).json({ error: error instanceof Error ? error.message : 'Unable to create reminder draft.' });
  }
};

export const getMarketplaceWhatsAppAutomations = async (_req: Request, res: Response, next: NextFunction) => {
  try {
    res.json(await getMarketplaceWhatsAppAutomationConfiguration());
  } catch (error) {
    next(error);
  }
};

export const saveMarketplaceWhatsAppTemplate = async (req: Request, res: Response) => {
  try {
    const body = req.body as Record<string, unknown>;
    const name = asOptionalString(body.name, 'name', 512)?.trim() || '';
    const language = asOptionalString(body.language, 'language', 16)?.trim() || 'en_US';
    const status = asOptionalString(body.status, 'status', 32)?.trim() || 'DRAFT';
    if (body.components !== undefined && (body.components === null || typeof body.components !== 'object')) {
      return res.status(400).json({ error: 'components must be a JSON object or array.' });
    }
    const template = await saveWhatsAppMetaTemplate({
      ...(typeof body.id === 'string' ? { id: body.id } : {}),
      name,
      language,
      status,
      ...(typeof body.metaTemplateId === 'string' ? { metaTemplateId: body.metaTemplateId } : {}),
      ...(typeof body.category === 'string' ? { category: body.category } : {}),
      ...(body.components !== undefined ? { components: body.components } : {}),
    });
    res.json({ message: 'WhatsApp template saved.', template });
  } catch (error) {
    res.status(400).json({ error: error instanceof Error ? error.message : 'Unable to save WhatsApp template.' });
  }
};

export const saveMarketplaceWhatsAppAutomation = async (req: Request, res: Response) => {
  try {
    const body = req.body as Record<string, unknown>;
    const eventCode = typeof body.eventCode === 'string' ? body.eventCode : '';
    if (!marketplaceWhatsAppEvents.includes(eventCode as typeof marketplaceWhatsAppEvents[number])) {
      return res.status(400).json({ error: 'Invalid marketplace WhatsApp event.' });
    }
    if (typeof body.enabled !== 'boolean') {
      return res.status(400).json({ error: 'enabled must be true or false.' });
    }
    if (body.templateId !== undefined && body.templateId !== null && typeof body.templateId !== 'string') {
      return res.status(400).json({ error: 'templateId must be a string or null.' });
    }
    const rule = await saveMarketplaceWhatsAppAutomationRule({
      eventCode: eventCode as typeof marketplaceWhatsAppEvents[number],
      enabled: body.enabled,
      templateId: typeof body.templateId === 'string' ? body.templateId : null,
    });
    res.json({ message: 'Marketplace WhatsApp automation saved.', rule });
  } catch (error) {
    res.status(400).json({ error: error instanceof Error ? error.message : 'Unable to save marketplace automation.' });
  }
};

export const getRecruitmentWhatsAppAutomations = async (_req: Request, res: Response, next: NextFunction) => {
  try {
    res.json(await getRecruitmentWhatsAppAutomationConfiguration());
  } catch (error) {
    next(error);
  }
};

export const saveRecruitmentWhatsAppAutomation = async (req: Request, res: Response) => {
  try {
    const body = req.body as Record<string, unknown>;
    const eventCode = typeof body.eventCode === 'string' ? body.eventCode : '';
    if (!recruitmentWhatsAppEvents.includes(eventCode as typeof recruitmentWhatsAppEvents[number])) {
      return res.status(400).json({ error: 'Invalid recruitment WhatsApp event.' });
    }
    if (typeof body.enabled !== 'boolean') {
      return res.status(400).json({ error: 'enabled must be true or false.' });
    }
    if (body.templateId !== undefined && body.templateId !== null && typeof body.templateId !== 'string') {
      return res.status(400).json({ error: 'templateId must be a string or null.' });
    }
    const rule = await saveRecruitmentWhatsAppAutomationRule({
      eventCode: eventCode as typeof recruitmentWhatsAppEvents[number],
      enabled: body.enabled,
      templateId: typeof body.templateId === 'string' ? body.templateId : null,
    });
    res.json({ message: 'Recruitment WhatsApp automation saved.', rule });
  } catch (error) {
    res.status(400).json({ error: error instanceof Error ? error.message : 'Unable to save recruitment automation.' });
  }
};
