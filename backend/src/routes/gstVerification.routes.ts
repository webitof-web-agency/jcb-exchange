import { Router } from 'express';
import {
  getGstVerificationDetail,
  getGstVerificationHistory,
  getGstTemplate,
  uploadGstTemplate,
  verifyGstin,
} from '../controllers/gstVerification.controller';
import {
  requireAdmin,
  requireAdminOrEmployeePermissions,
  requireAuth,
} from '../middlewares/auth.middleware';
import { getDocumentUploadMiddleware } from '../utils/documentUpload';

const router = Router();
const canView = requireAdminOrEmployeePermissions(['gst.verification.read']);
const canVerifyForKycEdit = requireAdminOrEmployeePermissions(['gst.verification.read', 'kyc.edit.override']);
const gstTemplateUpload = getDocumentUploadMiddleware('secure');

router.use(requireAuth, requireAdmin);
router.post('/verify', canVerifyForKycEdit, verifyGstin);
router.post('/:id/template', canView, gstTemplateUpload.single('template'), uploadGstTemplate);
router.get('/:id/template', canView, getGstTemplate);
router.get('/history', canView, getGstVerificationHistory);
router.get('/history/:id', canView, getGstVerificationDetail);

export default router;
