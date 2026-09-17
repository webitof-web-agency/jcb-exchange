import express, { Router } from 'express';
import { receiveWhatsAppWebhook, verifyWhatsAppWebhook } from '../controllers/whatsappWebhook.controller';

const router = Router();

router.get('/', verifyWhatsAppWebhook);
router.post('/', express.raw({ type: 'application/json', limit: '2mb' }), receiveWhatsAppWebhook);

export default router;
