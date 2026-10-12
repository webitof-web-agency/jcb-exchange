import { Router } from 'express';
import {
  getMobileToRcHistory,
  getMobileToRcHistoryDetail,
  lookupMobileToRc,
} from '../controllers/mobileToRcLookup.controller';
import { requireAdmin, requireAdminOrEmployeePermissions, requireAuth } from '../middlewares/auth.middleware';

const router = Router();
const canView = requireAdminOrEmployeePermissions(['rc.mobile-to-rc.read']);

router.use(requireAuth, requireAdmin);
router.post('/lookup', canView, lookupMobileToRc);
router.get('/history', canView, getMobileToRcHistory);
router.get('/history/:id', canView, getMobileToRcHistoryDetail);

export default router;
