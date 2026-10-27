import { Router } from 'express';
import {
  getPanVerificationDetail,
  getPanVerificationHistory,
  panComprehensiveV2,
  uploadPanTemplate,
  getPanTemplate,
  panToAadhaar,
  panToContact,
  verifyPan,
} from '../controllers/panVerification.controller';
import {
  requireAdmin,
  requireAdminOrEmployeePermissions,
  requireAuth,
} from '../middlewares/auth.middleware';
import { getDocumentUploadMiddleware } from '../utils/documentUpload';

const router = Router();
const canView = requireAdminOrEmployeePermissions(['pan.verification.read']);
const canVerifyForKycEdit = requireAdminOrEmployeePermissions(['pan.verification.read', 'kyc.edit.override']);
const panTemplateUpload = getDocumentUploadMiddleware('secure');

router.use(requireAuth, requireAdmin);
router.post('/verify', canView, verifyPan);
router.post('/to-aadhaar', canView, panToAadhaar);
router.post('/contact', canView, panToContact);
router.post('/comprehensive', canVerifyForKycEdit, panComprehensiveV2);
// Keep the old path for already deployed clients and bookmarked integrations.
router.post('/comprehensive-v2', canVerifyForKycEdit, panComprehensiveV2);
router.post('/:id/template', canView, panTemplateUpload.single('template'), uploadPanTemplate);
router.get('/:id/template', canView, getPanTemplate);
router.get('/history', canView, getPanVerificationHistory);
router.get('/history/:id', canView, getPanVerificationDetail);

export default router;
