import { Router } from 'express';
import {
  getRcOwnerHistory,
  getRcOwnerHistoryDetail,
  getRcOwnerHistoryTemplate,
  uploadRcOwnerHistoryTemplate,
  verifyRcOwnerHistory,
} from '../controllers/rcOwnerHistory.controller';
import { requireAdmin, requireAdminOrEmployeePermissions, requireAuth } from '../middlewares/auth.middleware';
import { surepassVerificationRateLimit } from '../middlewares/rateLimit.middleware';
import { getDocumentUploadMiddleware } from '../utils/documentUpload';

const router = Router();
const canView = requireAdminOrEmployeePermissions(['rc.owner-history.read']);
const rcOwnerHistoryTemplateUpload = getDocumentUploadMiddleware('secure');

router.use(requireAuth, requireAdmin);
router.post('/verify', canView, surepassVerificationRateLimit, verifyRcOwnerHistory);
router.post('/:id/template', canView, rcOwnerHistoryTemplateUpload.single('template'), uploadRcOwnerHistoryTemplate);
router.get('/:id/template', canView, getRcOwnerHistoryTemplate);
router.get('/history', canView, getRcOwnerHistory);
router.get('/history/:id', canView, getRcOwnerHistoryDetail);

export default router;
