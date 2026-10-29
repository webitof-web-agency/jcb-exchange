import { Router } from 'express';
import {
  login,
  register,
  googleLogin,
  getGoogleClientConfig,
  getMobileOtpConfig,
  getEmailOtpConfig,
  getProfile,
  updatePassword,
  updateProfile,
  submitKyc,
  checkSetup,
  getPartnerOnboarding,
  savePartnerOnboarding,
  submitPartnerOnboarding,
  getCustomerPrimeAccess,
  getCustomerPrimeHistory,
  submitCustomerPrimeSubscription,
  sendLoginOtp,
  verifyLoginOtp,
  resendLoginOtp,
  sendPasswordResetOtp,
  resendPasswordResetOtp,
  verifyPasswordResetOtp,
  resetPasswordWithToken,
  sendEmailLoginOtp,
  verifyEmailLoginOtp,
  resendEmailLoginOtp,
  uploadProfileAvatar,
  deleteProfileAvatar,
} from '../controllers/auth.controller';
import { requireAuth } from '../middlewares/auth.middleware';
import {
  cancelPartnerAadhaar,
  completePartnerAadhaar,
  getPartnerAadhaarStatus,
  getPartnerKycTemplate,
  initializePartnerAadhaar,
  uploadPartnerKycTemplate,
  verifyPartnerGstin,
  verifyPartnerPan,
} from '../controllers/partnerKycVerification.controller';
import { getAvatarUploadMiddleware, getDocumentUploadMiddleware } from '../utils/documentUpload';

const router = Router();

router.get('/setup-status', checkSetup);
router.get('/google-config', getGoogleClientConfig);
router.get('/mobile-otp/config', getMobileOtpConfig);
router.get('/email-otp/config', getEmailOtpConfig);
router.post('/register', register);
router.post('/login', login);
router.post('/login/mobile-otp/send', sendLoginOtp);
router.post('/login/mobile-otp/verify', verifyLoginOtp);
router.post('/login/mobile-otp/resend', resendLoginOtp);
router.post('/password-reset/mobile-otp/send', sendPasswordResetOtp);
router.post('/password-reset/mobile-otp/resend', resendPasswordResetOtp);
router.post('/password-reset/mobile-otp/verify', verifyPasswordResetOtp);
router.post('/password-reset/reset', resetPasswordWithToken);
router.post('/login/email-otp/send', sendEmailLoginOtp);
router.post('/login/email-otp/verify', verifyEmailLoginOtp);
router.post('/login/email-otp/resend', resendEmailLoginOtp);
router.post('/google', googleLogin);
router.get('/profile', requireAuth, getProfile);
router.patch('/profile', requireAuth, updateProfile);
router.patch('/profile/password', requireAuth, updatePassword);
router.patch('/profile/avatar', requireAuth, getAvatarUploadMiddleware().single('file'), uploadProfileAvatar);
router.delete('/profile/avatar', requireAuth, deleteProfileAvatar);
router.get('/customer-prime/access', requireAuth, getCustomerPrimeAccess);
router.get('/customer-prime/history', requireAuth, getCustomerPrimeHistory);
router.post('/customer-prime/subscribe', requireAuth, submitCustomerPrimeSubscription);
router.get('/partner/onboarding', requireAuth, getPartnerOnboarding);
router.put('/partner/onboarding', requireAuth, savePartnerOnboarding);
router.post('/partner/onboarding/submit', requireAuth, submitPartnerOnboarding);
router.post('/partner/kyc/verify-pan', requireAuth, verifyPartnerPan);
router.post('/partner/kyc/verify-gstin', requireAuth, verifyPartnerGstin);
router.post('/partner/kyc/verify-aadhaar/initialize', requireAuth, initializePartnerAadhaar);
router.post('/partner/kyc/verify-aadhaar/complete', requireAuth, completePartnerAadhaar);
router.post('/partner/kyc/verify-aadhaar/cancel', requireAuth, cancelPartnerAadhaar);
router.get('/partner/kyc/verify-aadhaar/status/:id', requireAuth, getPartnerAadhaarStatus);
router.post('/partner/kyc/:documentType/:id/template', requireAuth, getDocumentUploadMiddleware('secure').single('template'), uploadPartnerKycTemplate);
router.get('/partner/kyc/:documentType/:id/template', requireAuth, getPartnerKycTemplate);
router.post('/partner/kyc', requireAuth, submitKyc);

export default router;
