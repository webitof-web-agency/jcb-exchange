import { Router } from 'express';
import {
  login,
  register,
  googleLogin,
  getGoogleClientConfig,
  getProfile,
  updatePassword,
  updateProfile,
  submitKyc,
  checkSetup,
  getPartnerOnboarding,
  savePartnerOnboarding,
  submitPartnerOnboarding,
  getCustomerPrimeAccess,
  submitCustomerPrimeSubscription,
} from '../controllers/auth.controller';
import { requireAuth } from '../middlewares/auth.middleware';

const router = Router();

router.get('/setup-status', checkSetup);
router.get('/google-config', getGoogleClientConfig);
router.post('/register', register);
router.post('/login', login);
router.post('/google', googleLogin);
router.get('/profile', requireAuth, getProfile);
router.patch('/profile', requireAuth, updateProfile);
router.patch('/profile/password', requireAuth, updatePassword);
router.get('/customer-prime/access', requireAuth, getCustomerPrimeAccess);
router.post('/customer-prime/subscribe', requireAuth, submitCustomerPrimeSubscription);
router.get('/partner/onboarding', requireAuth, getPartnerOnboarding);
router.put('/partner/onboarding', requireAuth, savePartnerOnboarding);
router.post('/partner/onboarding/submit', requireAuth, submitPartnerOnboarding);
router.post('/partner/kyc', requireAuth, submitKyc);

export default router;
