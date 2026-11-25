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
import { surepassVerificationRateLimit } from '../middlewares/rateLimit.middleware';
import { getDocumentUploadMiddleware } from '../utils/documentUpload';

const router = Router();
const canView = requireAdminOrEmployeePermissions(['pan.verification.read']);
const canVerifyForKycEdit = requireAdminOrEmployeePermissions(['pan.verification.read', 'kyc.edit.override', 'hrm.documents.manage']);
// HR staff verify an employee's PAN from HRM and save its template; they do not get the wider PAN tools or history.
const canUseTemplate = requireAdminOrEmployeePermissions(['pan.verification.read', 'hrm.documents.manage']);
const panTemplateUpload = getDocumentUploadMiddleware('secure');

router.use(requireAuth, requireAdmin);
router.post('/verify', canView, surepassVerificationRateLimit, verifyPan);
router.post('/to-aadhaar', canView, surepassVerificationRateLimit, panToAadhaar);
router.post('/contact', canView, surepassVerificationRateLimit, panToContact);
router.post('/comprehensive', canVerifyForKycEdit, surepassVerificationRateLimit, panComprehensiveV2);
// Keep the old path for already deployed clients and bookmarked integrations.
router.post('/comprehensive-v2', canVerifyForKycEdit, surepassVerificationRateLimit, panComprehensiveV2);
router.post('/:id/template', canUseTemplate, panTemplateUpload.single('template'), uploadPanTemplate);
router.get('/:id/template', canUseTemplate, getPanTemplate);
router.get('/history', canView, getPanVerificationHistory);
router.get('/history/:id', canView, getPanVerificationDetail);

export default router;
