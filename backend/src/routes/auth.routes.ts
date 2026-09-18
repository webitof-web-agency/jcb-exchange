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
  sendEmailLoginOtp,
  verifyEmailLoginOtp,
  resendEmailLoginOtp,
} from '../controllers/auth.controller';
import { requireAuth } from '../middlewares/auth.middleware';

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
router.post('/login/email-otp/send', sendEmailLoginOtp);
router.post('/login/email-otp/verify', verifyEmailLoginOtp);
router.post('/login/email-otp/resend', resendEmailLoginOtp);
router.post('/google', googleLogin);
router.get('/profile', requireAuth, getProfile);
router.patch('/profile', requireAuth, updateProfile);
router.patch('/profile/password', requireAuth, updatePassword);
router.get('/customer-prime/access', requireAuth, getCustomerPrimeAccess);
router.get('/customer-prime/history', requireAuth, getCustomerPrimeHistory);
router.post('/customer-prime/subscribe', requireAuth, submitCustomerPrimeSubscription);
router.get('/partner/onboarding', requireAuth, getPartnerOnboarding);
router.put('/partner/onboarding', requireAuth, savePartnerOnboarding);
router.post('/partner/onboarding/submit', requireAuth, submitPartnerOnboarding);
router.post('/partner/kyc', requireAuth, submitKyc);

export default router;
