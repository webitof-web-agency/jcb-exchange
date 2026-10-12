import type { NextFunction, Request, Response } from 'express';
import {
  apiWalletBillingService,
  isApiWalletBillingError,
  verifyApiBillingWebhookSignature,
} from '../services/apiWalletBilling.service';

const webhookSecret = () => process.env.API_BILLING_WEBHOOK_SECRET?.trim();

const sendBillingError = (error: unknown, res: Response, next: NextFunction) => {
  if (isApiWalletBillingError(error)) {
    return res.status(error.statusCode).json({ success: false, error: error.message, code: error.code });
  }
  return next(error);
};

export const getApiBillingSummary = async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const summary = await apiWalletBillingService.getSummary();
    res.set('Cache-Control', 'no-store');
    return res.json({ success: true, ...summary });
  } catch (error) {
    return sendBillingError(error, res, next);
  }
};

export const receiveApiBillingWebhook = async (req: Request, res: Response, next: NextFunction) => {
  const rawBody = Buffer.isBuffer(req.body) ? req.body : null;
  const signature = req.headers['x-api-billing-signature'];

  if (!rawBody || !verifyApiBillingWebhookSignature(rawBody, signature, webhookSecret())) {
    return res.status(401).json({
      success: false,
      error: 'Webhook signature is invalid.',
      code: 'billing_webhook_unauthorized',
    });
  }

  try {
    const result = await apiWalletBillingService.processSignedWebhook(rawBody);
    res.set('Cache-Control', 'no-store');
    return res.status(200).json({ success: true, ...result });
  } catch (error) {
    return sendBillingError(error, res, next);
  }
};
