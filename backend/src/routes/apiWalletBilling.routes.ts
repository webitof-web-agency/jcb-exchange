import { Router } from 'express';
import { getApiBillingSummary } from '../controllers/apiWalletBilling.controller';
import { requireAdmin, requireAuth } from '../middlewares/auth.middleware';

const router = Router();

router.use(requireAuth, requireAdmin);
router.get('/summary', getApiBillingSummary);

export default router;
