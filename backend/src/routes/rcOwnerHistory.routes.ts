import { Router } from 'express';
import {
  getRcOwnerHistory,
  getRcOwnerHistoryDetail,
  verifyRcOwnerHistory,
} from '../controllers/rcOwnerHistory.controller';
import { requireAdmin, requireAdminOrEmployeePermissions, requireAuth } from '../middlewares/auth.middleware';

const router = Router();
const canView = requireAdminOrEmployeePermissions(['rc.owner-history.read']);

router.use(requireAuth, requireAdmin);
router.post('/verify', canView, verifyRcOwnerHistory);
router.get('/history', canView, getRcOwnerHistory);
router.get('/history/:id', canView, getRcOwnerHistoryDetail);

export default router;
