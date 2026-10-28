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
import { loginRateLimit, otpRateLimit, passwordResetRateLimit, registerRateLimit } from '../middlewares/rateLimit.middleware';
import { verifyPartnerGstin, verifyPartnerPan } from '../controllers/partnerKycVerification.controller';
import { getAvatarUploadMiddleware } from '../utils/documentUpload';

const router = Router();

router.get('/setup-status', checkSetup);
router.get('/google-config', getGoogleClientConfig);
router.get('/mobile-otp/config', getMobileOtpConfig);
router.get('/email-otp/config', getEmailOtpConfig);
router.post('/register', registerRateLimit, register);
router.post('/login', loginRateLimit, login);
router.post('/login/mobile-otp/send', otpRateLimit, sendLoginOtp);
router.post('/login/mobile-otp/verify', otpRateLimit, verifyLoginOtp);
router.post('/login/mobile-otp/resend', otpRateLimit, resendLoginOtp);
router.post('/password-reset/mobile-otp/send', otpRateLimit, sendPasswordResetOtp);
router.post('/password-reset/mobile-otp/resend', otpRateLimit, resendPasswordResetOtp);
router.post('/password-reset/mobile-otp/verify', otpRateLimit, verifyPasswordResetOtp);
router.post('/password-reset/reset', passwordResetRateLimit, resetPasswordWithToken);
router.post('/login/email-otp/send', otpRateLimit, sendEmailLoginOtp);
router.post('/login/email-otp/verify', otpRateLimit, verifyEmailLoginOtp);
router.post('/login/email-otp/resend', otpRateLimit, resendEmailLoginOtp);
router.post('/google', loginRateLimit, googleLogin);
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
router.post('/partner/kyc', requireAuth, submitKyc);

export default router;
