import { Router } from 'express';
import {
  exportAnalyticsListings,
  getAnalyticsListingDetail,
  getAnalyticsListings,
  getAnalyticsOptions,
  getAnalyticsOverview,
  getPartnerAnalyticsOverview,
  ingestAnalyticsEvent,
} from '../controllers/analytics.controller';
import { requireAnalyticsAccess, requireAuth } from '../middlewares/auth.middleware';

const router = Router();

router.get('/partner-overview', requireAuth, getPartnerAnalyticsOverview);
router.get('/options', requireAuth, requireAnalyticsAccess, getAnalyticsOptions);
router.get('/overview', requireAuth, requireAnalyticsAccess, getAnalyticsOverview);
router.get('/listings', requireAuth, requireAnalyticsAccess, getAnalyticsListings);
router.get('/listings/:id', requireAuth, requireAnalyticsAccess, getAnalyticsListingDetail);
router.get('/export/listings.csv', requireAuth, requireAnalyticsAccess, exportAnalyticsListings);
router.post('/events', ingestAnalyticsEvent);

export default router;
