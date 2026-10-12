import { Router } from 'express';
import {
  getPanVerificationDetail,
  getPanVerificationHistory,
  panComprehensiveV2,
  panToAadhaar,
  panToContact,
  verifyPan,
} from '../controllers/panVerification.controller';
import {
  requireAdmin,
  requireAdminOrEmployeePermissions,
  requireAuth,
} from '../middlewares/auth.middleware';

const router = Router();
const canView = requireAdminOrEmployeePermissions(['pan.verification.read']);

router.use(requireAuth, requireAdmin);
router.post('/verify', canView, verifyPan);
router.post('/to-aadhaar', canView, panToAadhaar);
router.post('/contact', canView, panToContact);
router.post('/comprehensive-v2', canView, panComprehensiveV2);
router.get('/history', canView, getPanVerificationHistory);
router.get('/history/:id', canView, getPanVerificationDetail);

export default router;
