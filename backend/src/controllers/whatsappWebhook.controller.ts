import type { Request, Response } from 'express';
import {
  applyWhatsAppWebhookStatuses,
  isWhatsAppIntegrationEnabled,
  verifyWhatsAppWebhookSignature,
  verifyWhatsAppWebhookToken,
} from '../services/whatsappIntegration.service';

export const verifyWhatsAppWebhook = async (req: Request, res: Response) => {
  const mode = String(req.query['hub.mode'] || '');
  const token = String(req.query['hub.verify_token'] || '');
  const challenge = String(req.query['hub.challenge'] || '');

  if (mode === 'subscribe' && challenge && await verifyWhatsAppWebhookToken(token)) {
    return res.status(200).send(challenge);
  }
  return res.sendStatus(403);
};

export const receiveWhatsAppWebhook = async (req: Request, res: Response) => {
  if (!await isWhatsAppIntegrationEnabled()) {
    return res.sendStatus(200);
  }
  const rawBody = Buffer.isBuffer(req.body) ? req.body : Buffer.from('');
  const signature = req.header('x-hub-signature-256');
  if (!await verifyWhatsAppWebhookSignature(rawBody, signature)) {
    return res.sendStatus(401);
  }

  try {
    await applyWhatsAppWebhookStatuses(JSON.parse(rawBody.toString('utf8')));
  } catch {
    // Meta retries non-2xx responses; malformed but authentic status payloads must not block future delivery updates.
  }

  return res.sendStatus(200);
};
