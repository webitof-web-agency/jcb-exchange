import type { NextFunction, Request, Response } from 'express';
import {
  getTransactionalEmailSettings,
  getTransactionalEmailLogs,
  sendTransactionalEmailTest,
  TransactionalEmailSettingsError,
  updateTransactionalEmailSettings,
  verifyTransactionalEmailConnection,
} from '../services/transactionalEmail.service';
import { retryTransactionalEmailLog } from '../services/recruitmentEmail.service';

const asOptionalString = (value: unknown, field: string, maxLength: number) => {
  if (value === undefined) return undefined;
  if (value === null) return null;
  if (typeof value !== 'string' || value.length > maxLength) {
    throw new TransactionalEmailSettingsError(`${field} must be a text value up to ${maxLength} characters.`);
  }
  return value;
};

const parseBoolean = (value: unknown, field: string) => {
  if (value === undefined) return undefined;
  if (typeof value !== 'boolean') throw new TransactionalEmailSettingsError(`${field} must be true or false.`);
  return value;
};

export const getEmailConfiguration = async (_req: Request, res: Response, next: NextFunction) => {
  try {
    res.json({ settings: await getTransactionalEmailSettings() });
  } catch (error) {
    next(error);
  }
};

export const getEmailDeliveryLogs = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const limit = typeof req.query.limit === 'string' ? Number(req.query.limit) : undefined;
    const status = typeof req.query.status === 'string' ? req.query.status : undefined;
    res.json(await getTransactionalEmailLogs({ ...(limit === undefined ? {} : { limit }), ...(status === undefined ? {} : { status }) }));
  } catch (error) {
    next(error);
  }
};

export const saveEmailConfiguration = async (req: Request, res: Response) => {
  try {
    const body = req.body as Record<string, unknown>;
    const enabled = parseBoolean(body.enabled, 'enabled');
    const smtpHostValue = body.smtpHost === null ? undefined : asOptionalString(body.smtpHost, 'smtpHost', 255);
    const smtpHost = typeof smtpHostValue === 'string' ? smtpHostValue : undefined;
    const smtpPort = body.smtpPort === undefined ? undefined : body.smtpPort as string | number;
    const smtpSecure = parseBoolean(body.smtpSecure, 'smtpSecure');
    const senderEmail = asOptionalString(body.senderEmail, 'senderEmail', 254);
    const senderName = asOptionalString(body.senderName, 'senderName', 120);
    const replyToEmail = asOptionalString(body.replyToEmail, 'replyToEmail', 254);
    const smtpPassword = asOptionalString(body.smtpPassword, 'smtpPassword', 4096);
    const settings = await updateTransactionalEmailSettings({
      ...(enabled === undefined ? {} : { enabled }),
      ...(smtpHost === undefined ? {} : { smtpHost }),
      ...(smtpPort === undefined ? {} : { smtpPort }),
      ...(smtpSecure === undefined ? {} : { smtpSecure }),
      ...(senderEmail === undefined ? {} : { senderEmail }),
      ...(senderName === undefined ? {} : { senderName }),
      ...(replyToEmail === undefined ? {} : { replyToEmail }),
      ...(smtpPassword === undefined ? {} : { smtpPassword }),
      updatedByUserId: req.user!.id,
    });
    res.json({ message: 'Transactional email settings saved.', settings });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to save transactional email settings.';
    res.status(error instanceof TransactionalEmailSettingsError ? error.statusCode : 400).json({ error: message });
  }
};

export const testEmailConnection = async (_req: Request, res: Response) => {
  try {
    res.json(await verifyTransactionalEmailConnection());
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to verify SMTP connection.';
    res.status(error instanceof TransactionalEmailSettingsError ? error.statusCode : 400).json({ error: message });
  }
};

export const sendEmailConfigurationTest = async (req: Request, res: Response) => {
  try {
    const recipient = typeof req.body?.to === 'string' ? req.body.to : '';
    res.json(await sendTransactionalEmailTest({ to: recipient }));
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to send test email.';
    res.status(error instanceof TransactionalEmailSettingsError ? error.statusCode : 400).json({ error: message });
  }
};

export const retryEmailDelivery = async (req: Request, res: Response) => {
  try {
    const logId = typeof req.params.id === 'string' ? req.params.id : '';
    if (!logId) return res.status(400).json({ error: 'Email delivery log id is required.' });
    const result = await retryTransactionalEmailLog(logId);
    res.json({ message: 'Email queued again. It goes out with the next delivery run.', result });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to retry email delivery.';
    res.status(400).json({ error: message });
  }
};
