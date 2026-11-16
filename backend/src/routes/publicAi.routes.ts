import { Router } from 'express';
import { publicBuyerSearch, publicSupportSearch } from '../controllers/publicAi.controller';
import { requireAuth } from '../middlewares/auth.middleware';
import { requireAiAccess } from '../middlewares/aiAccess.middleware';
import { publicAiRateLimit } from '../middlewares/rateLimit.middleware';

const router = Router();

// AI is an internal operator capability. Keep the historical public URL namespace
// for compatibility, but require the same server-side authorization as /ai/*.
router.use(requireAuth, requireAiAccess);
router.post('/buyer-search', publicAiRateLimit, publicBuyerSearch);
router.post('/support', publicAiRateLimit, publicSupportSearch);

export default router;
