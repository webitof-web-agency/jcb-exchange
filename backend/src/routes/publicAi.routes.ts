import { Router } from 'express';
import { publicBuyerSearch, publicSupportSearch } from '../controllers/publicAi.controller';
import { publicAiRateLimit } from '../middlewares/rateLimit.middleware';

const router = Router();

router.post('/buyer-search', publicAiRateLimit, publicBuyerSearch);
router.post('/support', publicAiRateLimit, publicSupportSearch);

export default router;
