import { Router } from 'express';
import { checkRcMobileNumber, getRcMobileNumberCheckHistory, getRcMobileNumberCheckHistoryDetail } from '../controllers/rcMobileNumberCheck.controller';
import { requireAdmin, requireAdminOrEmployeePermissions, requireAuth } from '../middlewares/auth.middleware';

const router = Router();
const canView = requireAdminOrEmployeePermissions(['rc.mobile-number-check.read']);

router.use(requireAuth, requireAdmin);
router.post('/check', canView, checkRcMobileNumber);
router.get('/history', canView, getRcMobileNumberCheckHistory);
router.get('/history/:id', canView, getRcMobileNumberCheckHistoryDetail);

export default router;
