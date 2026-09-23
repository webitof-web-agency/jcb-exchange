import type { NextFunction, Request, Response } from 'express';
import prisma from '../lib/prisma';
import {
  getMarketplaceSmsAutomationConfiguration,
  getRecruitmentSmsAutomationConfiguration,
  getSmsMessageLogs,
  getSmsSettings,
  marketplaceSmsEvents,
  recruitmentSmsEvents,
  retryFailedSmsMessage,
  revealSmsApiKey,
  saveMarketplaceSmsAutomationRule,
  saveRecruitmentSmsAutomationRule,
  sendSmsTestMessage,
  updateSmsSettings,
} from '../services/smsIntegration.service';

const asOptionalString = (value: unknown, field: string, maxLength = 1000) => {
  if (value === undefined) return undefined;
  if (typeof value !== 'string' || value.length > maxLength) throw new Error(`${field} must be a text value up to ${maxLength} characters.`);
  return value;
};

export const getSmsConfiguration = async (_req: Request, res: Response, next: NextFunction) => {
  try {
    res.json({ settings: await getSmsSettings() });
  } catch (error) {
    next(error);
  }
};

export const revealSmsApiKeyValue = async (_req: Request, res: Response) => {
  try {
    res.json({ value: await revealSmsApiKey() });
  } catch (error) {
    res.status(400).json({ error: error instanceof Error ? error.message : 'Unable to reveal SMS API key.' });
  }
};

export const saveSmsConfiguration = async (req: Request, res: Response) => {
  try {
    const body = req.body as Record<string, unknown>;
    if (body.enabled !== undefined && typeof body.enabled !== 'boolean') return res.status(400).json({ error: 'enabled must be true or false.' });
    if (body.smsDetails !== undefined && !['0', '1'].includes(String(body.smsDetails))) return res.status(400).json({ error: 'smsDetails must be 0 or 1.' });
    const apiKey = asOptionalString(body.apiKey, 'apiKey', 4096);
    const baseUrl = asOptionalString(body.baseUrl, 'baseUrl', 300);
    const senderId = asOptionalString(body.senderId, 'senderId', 20);
    const testRecipientPhone = asOptionalString(body.testRecipientPhone, 'testRecipientPhone', 32);
    const settings = await updateSmsSettings({
      ...(body.enabled === undefined ? {} : { enabled: body.enabled }),
      ...(apiKey === undefined ? {} : { apiKey }),
      ...(baseUrl === undefined ? {} : { baseUrl }),
      ...(senderId === undefined ? {} : { senderId }),
      ...(testRecipientPhone === undefined ? {} : { testRecipientPhone }),
      ...(body.smsDetails === undefined ? {} : { smsDetails: body.smsDetails as '0' | '1' }),
      updatedByUserId: req.user!.id,
    });
    res.json({ message: 'SMS configuration saved.', settings });
  } catch (error) {
    res.status(400).json({ error: error instanceof Error ? error.message : 'Unable to save SMS configuration.' });
  }
};

export const getSmsDashboard = async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const since = new Date();
    since.setDate(since.getDate() - 7);
    const [settings, totalMessages, sentLast7Days, failedLast7Days, recentMessages] = await Promise.all([
      getSmsSettings(),
      prisma.smsMessageLog.count(),
      prisma.smsMessageLog.count({ where: { status: 'SENT', createdAt: { gte: since } } }),
      prisma.smsMessageLog.count({ where: { status: 'FAILED', createdAt: { gte: since } } }),
      prisma.smsMessageLog.findMany({ orderBy: { createdAt: 'desc' }, take: 8, select: { id: true, eventCode: true, recipientType: true, recipientPhone: true, status: true, errorMessage: true, createdAt: true } }),
    ]);
    res.json({
      settings,
      stats: { totalMessages, sentLast7Days, failedLast7Days },
      recentMessages: recentMessages.map((message) => ({ ...message, recipientPhone: `${'*'.repeat(Math.max(0, message.recipientPhone.length - 4))}${message.recipientPhone.slice(-4)}` })),
    });
  } catch (error) {
    next(error);
  }
};

export const sendSmsConfigurationTest = async (req: Request, res: Response) => {
  try {
    const messageId = typeof req.body?.messageId === 'string' ? req.body.messageId.trim() : '';
    const variablesValues = typeof req.body?.variablesValues === 'string' ? req.body.variablesValues : '';
    if (!messageId) return res.status(400).json({ error: 'DLT Message ID is required for a test SMS.' });
    const result = await sendSmsTestMessage({ messageId, variablesValues, actorUserId: req.user!.id });
    res.json({ message: 'Test SMS submitted.', result });
  } catch (error) {
    res.status(400).json({ error: error instanceof Error ? error.message : 'Unable to send test SMS.' });
  }
};

export const getSmsLogs = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const status = typeof req.query.status === 'string' ? req.query.status.toUpperCase() : undefined;
    const recipientType = typeof req.query.recipientType === 'string' ? req.query.recipientType.toUpperCase() : undefined;
    const eventCode = typeof req.query.eventCode === 'string' ? req.query.eventCode.trim() : undefined;
    const rawLimit = Number.parseInt(String(req.query.limit || '50'), 10);
    if (status && !['QUEUED', 'SENT', 'FAILED', 'SKIPPED'].includes(status)) return res.status(400).json({ error: 'Invalid SMS log status filter.' });
    if (eventCode && eventCode.length > 100) return res.status(400).json({ error: 'Event filter is too long.' });
    res.json({ logs: await getSmsMessageLogs({
      ...(status === undefined ? {} : { status }),
      ...(recipientType === undefined ? {} : { recipientType }),
      ...(eventCode === undefined ? {} : { eventCode }),
      limit: Number.isFinite(rawLimit) ? rawLimit : 50,
    }) });
  } catch (error) {
    next(error);
  }
};

export const retrySmsLog = async (req: Request, res: Response) => {
  try {
    const id = String(req.params.id || '').trim();
    if (!id || id.length > 100) return res.status(400).json({ error: 'Valid SMS message id is required.' });
    const result = await retryFailedSmsMessage(id);
    res.json({ message: result.sent ? 'SMS retry sent.' : 'SMS retry attempted but provider rejected it.', result });
  } catch (error) {
    res.status(400).json({ error: error instanceof Error ? error.message : 'Unable to retry SMS message.' });
  }
};

export const deleteSmsLog = async (req: Request, res: Response) => {
  try {
    const id = String(req.params.id || '').trim();
    if (!id || id.length > 100) return res.status(400).json({ error: 'Valid SMS message id is required.' });
    const existing = await prisma.smsMessageLog.findUnique({ where: { id } });
    if (!existing) {
      return res.status(404).json({ error: 'SMS log not found.' });
    }
    await prisma.smsMessageLog.delete({ where: { id } });
    res.json({ message: 'SMS log deleted successfully.' });
  } catch (error) {
    res.status(400).json({ error: error instanceof Error ? error.message : 'Unable to delete SMS log.' });
  }
};

export const clearSmsLogs = async (_req: Request, res: Response) => {
  try {
    await prisma.smsMessageLog.deleteMany({});
    res.json({ message: 'All SMS logs cleared successfully.' });
  } catch (error) {
    res.status(400).json({ error: error instanceof Error ? error.message : 'Unable to clear SMS logs.' });
  }
};

const saveRule = async (req: Request, res: Response, eventCodes: readonly string[], save: (input: { eventCode: never; enabled: boolean; messageId?: string | null; variablesTemplate?: string | null }) => Promise<unknown>, label: string) => {
  try {
    const body = req.body as Record<string, unknown>;
    const eventCode = typeof body.eventCode === 'string' ? body.eventCode : '';
    if (!eventCodes.includes(eventCode)) return res.status(400).json({ error: `Invalid ${label} SMS event.` });
    if (typeof body.enabled !== 'boolean') return res.status(400).json({ error: 'enabled must be true or false.' });
    const messageId = body.messageId === null || body.messageId === undefined ? null : asOptionalString(body.messageId, 'messageId', 40);
    const variablesTemplate = body.variablesTemplate === null || body.variablesTemplate === undefined ? null : asOptionalString(body.variablesTemplate, 'variablesTemplate', 1000);
    const rule = await save({
      eventCode: eventCode as never,
      enabled: body.enabled,
      ...(messageId === undefined ? {} : { messageId }),
      ...(variablesTemplate === undefined ? {} : { variablesTemplate }),
    });
    res.json({ message: `${label} SMS automation saved.`, rule });
  } catch (error) {
    res.status(400).json({ error: error instanceof Error ? error.message : `Unable to save ${label.toLowerCase()} SMS automation.` });
  }
};

export const getMarketplaceSmsAutomations = async (_req: Request, res: Response, next: NextFunction) => {
  try { res.json(await getMarketplaceSmsAutomationConfiguration()); } catch (error) { next(error); }
};

export const saveMarketplaceSmsAutomation = (req: Request, res: Response) => saveRule(req, res, marketplaceSmsEvents, saveMarketplaceSmsAutomationRule as never, 'Marketplace');

export const getRecruitmentSmsAutomations = async (_req: Request, res: Response, next: NextFunction) => {
  try { res.json(await getRecruitmentSmsAutomationConfiguration()); } catch (error) { next(error); }
};

export const saveRecruitmentSmsAutomation = (req: Request, res: Response) => saveRule(req, res, recruitmentSmsEvents, saveRecruitmentSmsAutomationRule as never, 'Recruitment');
