import { Router } from 'express';
import {
  getMobileToPanHistory,
  getMobileToPanHistoryDetail,
  lookupMobileToPan,
} from '../controllers/mobileToPanLookup.controller';
import { requireAdmin, requireAdminOrEmployeePermissions, requireAuth } from '../middlewares/auth.middleware';
import { surepassVerificationRateLimit } from '../middlewares/rateLimit.middleware';

const router = Router();
const canView = requireAdminOrEmployeePermissions(['pan.mobile-to-pan.read']);

router.use(requireAuth, requireAdmin);
router.post('/lookup', canView, surepassVerificationRateLimit, lookupMobileToPan);
router.get('/history', canView, getMobileToPanHistory);
router.get('/history/:id', canView, getMobileToPanHistoryDetail);

export default router;
