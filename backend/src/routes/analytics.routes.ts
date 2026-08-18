import { Router } from 'express';
import { getPartnerAnalyticsOverview } from '../controllers/analytics.controller';
import { requireAuth } from '../middlewares/auth.middleware';

const router = Router();

router.get('/partner-overview', requireAuth, getPartnerAnalyticsOverview);

export default router;
