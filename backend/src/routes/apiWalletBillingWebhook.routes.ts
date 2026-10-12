import { Router } from 'express';
import { receiveApiBillingWebhook } from '../controllers/apiWalletBilling.controller';

const router = Router();

router.post('/', receiveApiBillingWebhook);

export default router;
