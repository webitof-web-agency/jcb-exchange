"use client";

import React, { Suspense, useState, useEffect, useCallback, useId } from 'react';
import axios from 'axios';
import Image from 'next/image';
import Link from 'next/link';
import { useSearchParams, useRouter } from 'next/navigation';
import {
  Mail,
  Lock,
  Eye,
  EyeOff,
  User,
  Phone,
  Smartphone,
  MessageCircle,
  AlertCircle,
  CheckCircle2,
  ArrowRight,
  ShieldCheck,
} from 'lucide-react';
import { toast } from 'react-toastify';
import api from '@/lib/api';
import { useTranslation } from '@/hooks/useTranslation';
import BrandLoader from '@/components/ui/BrandLoader';
import { useAuthStore } from '@/store/authStore';
import { resolveLoginRedirect } from '@/lib/loginRedirect';
import { ACCOUNT_INACTIVE_CODE, ACCOUNT_REVOKED_CODE } from '@/lib/sessionAccess';
import { getEmployeeLandingPath, resolveEmployeeRouteRedirect } from '@/lib/portalRoutes';
import { formatPortalLabel } from '@/lib/partnerPortal';
import {
  getOtpResendSecondsRemaining,
  getOtpSecondsRemaining,
  normalizeOtpCooldownSeconds,
  normalizeOtpExpirySeconds,
  normalizeOtpInput,
  normalizeOtpLength,
} from '@/lib/loginOtp';
import { validatePasswordResetInput } from '@/lib/passwordReset';
import {
  sanitizeEmail,
  isValidEmail,
  sanitizeMobile,
  isValidIndianMobile,
  sanitizeName,
  sanitizePassword,
} from '@/lib/authSanitization';

type AuthenticatedPortalUser = {
  id: string;
  email: string;
  name: string;
  role: string;
  permissions?: string[];
  accountStatus?: string | null;
  onboardingStatus?: string | null;
  kycStatus?: string | null;
};

type AuthTab = 'login' | 'register';
type LoginMethod = 'password' | 'mobileOtp' | 'emailOtp';
type PasswordResetStep = 'mobile' | 'otp' | 'password';

type OtpConfigResponse = {
  enabled?: boolean;
  otpLength?: number;
  otpExpirySeconds?: number;
  resendCooldownSeconds?: number;
};

const getOtpErrorMessage = (error: unknown, fallback: string) => {
  if (!axios.isAxiosError(error)) return fallback;
  return error.response?.data?.error || error.response?.data?.message || fallback;
};

function LoginPageInner() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const setAuth = useAuthStore((state) => state.setAuth);
  const logout = useAuthStore((state) => state.logout);
  const { t } = useTranslation();

  const initialTab = searchParams.get('tab') === 'register' ? 'register' : 'login';
  const [activeTab, setActiveTab] = useState<AuthTab>(initialTab);

  // Login form state
  const [loginData, setLoginData] = useState({ email: '', password: '' });
  const [showLoginPassword, setShowLoginPassword] = useState(false);
  const [loginCapsLock, setLoginCapsLock] = useState(false);
  const [loginMethod, setLoginMethod] = useState<LoginMethod>('password');
  const [mobileOtpEnabled, setMobileOtpEnabled] = useState(false);
  const [emailOtpEnabled, setEmailOtpEnabled] = useState(false);
  const [loginMobile, setLoginMobile] = useState('');
  const [mobileOtp, setMobileOtp] = useState('');
  const [mobileChallengeId, setMobileChallengeId] = useState('');
  const [mobileMaskedMobile, setMobileMaskedMobile] = useState('');
  const [mobileOtpLength, setMobileOtpLength] = useState(6);
  const [mobileOtpExpirySeconds, setMobileOtpExpirySeconds] = useState(900);
  const [mobileOtpCooldownSeconds, setMobileOtpCooldownSeconds] = useState(45);
  const [mobileOtpExpiresAt, setMobileOtpExpiresAt] = useState(0);
  const [mobileOtpResendAvailableAt, setMobileOtpResendAvailableAt] = useState(0);
  const [emailOtpEmail, setEmailOtpEmail] = useState('');
  const [emailOtp, setEmailOtp] = useState('');
  const [emailChallengeId, setEmailChallengeId] = useState('');
  const [emailMaskedEmail, setEmailMaskedEmail] = useState('');
  const [emailOtpLength, setEmailOtpLength] = useState(6);
  const [emailOtpExpirySeconds, setEmailOtpExpirySeconds] = useState(600);
  const [emailOtpCooldownSeconds, setEmailOtpCooldownSeconds] = useState(45);
  const [emailOtpExpiresAt, setEmailOtpExpiresAt] = useState(0);
  const [emailOtpResendAvailableAt, setEmailOtpResendAvailableAt] = useState(0);
  const [otpNow, setOtpNow] = useState(() => Date.now());
  const [otpAction, setOtpAction] = useState<string | null>(null);
  const [isPasswordReset, setIsPasswordReset] = useState(false);
  const [passwordResetStep, setPasswordResetStep] = useState<PasswordResetStep>('mobile');
  const [passwordResetMobile, setPasswordResetMobile] = useState('');
  const [passwordResetOtp, setPasswordResetOtp] = useState('');
  const [passwordResetChallengeId, setPasswordResetChallengeId] = useState('');
  const [passwordResetMaskedMobile, setPasswordResetMaskedMobile] = useState('');
  const [passwordResetOtpLength, setPasswordResetOtpLength] = useState(6);
  const [passwordResetOtpExpiresAt, setPasswordResetOtpExpiresAt] = useState(0);
  const [passwordResetResendAvailableAt, setPasswordResetResendAvailableAt] = useState(0);
  const [passwordResetToken, setPasswordResetToken] = useState('');
  const [passwordResetNewPassword, setPasswordResetNewPassword] = useState('');
  const [passwordResetConfirmPassword, setPasswordResetConfirmPassword] = useState('');
  const [showPasswordResetPassword, setShowPasswordResetPassword] = useState(false);
  const [showPasswordResetConfirmPassword, setShowPasswordResetConfirmPassword] = useState(false);
  const [passwordResetAction, setPasswordResetAction] = useState<string | null>(null);

  // Register form state
  const [registerData, setRegisterData] = useState({
    name: '',
    email: '',
    mobile: '',
    password: '',
    confirmPassword: '',
  });
  const [whatsappSameAsMobile, setWhatsappSameAsMobile] = useState(true);
  const [whatsappNumber, setWhatsappNumber] = useState('');
  const [showRegisterPassword, setShowRegisterPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  // Status state
  const [error, setError] = useState('');
  const [successMessage, setSuccessMessage] = useState('');
  const [loading, setLoading] = useState(false);
  const [isFirstSetup, setIsFirstSetup] = useState(false);
  const [statusLoading, setStatusLoading] = useState(true);

  const emailInputId = useId();
  const passwordInputId = useId();

  const activeLoginMethod: LoginMethod =
    loginMethod === 'mobileOtp' && mobileOtpEnabled
      ? 'mobileOtp'
      : loginMethod === 'emailOtp' && emailOtpEnabled
        ? 'emailOtp'
        : 'password';
  const mobileOtpSecondsRemaining = getOtpSecondsRemaining(mobileOtpExpiresAt, otpNow);
  const mobileOtpResendSecondsRemaining = getOtpResendSecondsRemaining(mobileOtpResendAvailableAt, otpNow);
  const emailOtpSecondsRemaining = getOtpSecondsRemaining(emailOtpExpiresAt, otpNow);
  const emailOtpResendSecondsRemaining = getOtpResendSecondsRemaining(emailOtpResendAvailableAt, otpNow);
  const passwordResetOtpSecondsRemaining = getOtpSecondsRemaining(passwordResetOtpExpiresAt, otpNow);
  const passwordResetResendSecondsRemaining = getOtpResendSecondsRemaining(passwordResetResendAvailableAt, otpNow);

  useEffect(() => {
    let cancelled = false;

    const loadOtpConfig = async () => {
      const [mobileResult, emailResult] = await Promise.allSettled([
        api.get<OtpConfigResponse>('/auth/mobile-otp/config'),
        api.get<OtpConfigResponse>('/auth/email-otp/config'),
      ]);

      if (cancelled) return;

      if (mobileResult.status === 'fulfilled') {
        const config = mobileResult.value.data;
        setMobileOtpEnabled(Boolean(config.enabled));
        setMobileOtpLength(normalizeOtpLength(config.otpLength));
        setMobileOtpExpirySeconds(normalizeOtpExpirySeconds(config.otpExpirySeconds, 900));
        setMobileOtpCooldownSeconds(normalizeOtpCooldownSeconds(config.resendCooldownSeconds));
      }

      if (emailResult.status === 'fulfilled') {
        const config = emailResult.value.data;
        setEmailOtpEnabled(Boolean(config.enabled));
        setEmailOtpLength(normalizeOtpLength(config.otpLength));
        setEmailOtpExpirySeconds(normalizeOtpExpirySeconds(config.otpExpirySeconds, 600));
        setEmailOtpCooldownSeconds(normalizeOtpCooldownSeconds(config.resendCooldownSeconds));
      }
    };

    void loadOtpConfig();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const interval = window.setInterval(() => setOtpNow(Date.now()), 1000);
    return () => window.clearInterval(interval);
  }, []);

  useEffect(() => {
    const tabParam = searchParams.get('tab');
    const nextTab: AuthTab = tabParam === 'register' ? 'register' : 'login';
    if (nextTab === activeTab) return undefined;

    const frame = window.requestAnimationFrame(() => setActiveTab(nextTab));
    return () => window.cancelAnimationFrame(frame);
  }, [activeTab, searchParams]);

  const showLoginSuccessToast = useCallback((user?: AuthenticatedPortalUser) => {
    const displayName = user?.name?.trim() || 'User';
    const roleLabel = user?.role ? formatPortalLabel(user.role) : 'PORTAL';

    toast.success(
      <div className="flex flex-col gap-0.5 min-w-0 pr-1">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-sm font-bold text-gray-900 truncate">
            Welcome, {displayName}! 👋
          </span>
          <span className="inline-flex rounded-md bg-amber-100 px-2 py-0.5 text-[9px] font-extrabold uppercase tracking-wider text-amber-800 border border-amber-200">
            {roleLabel}
          </span>
        </div>
        <p className="text-xs text-gray-500 font-medium mt-0.5">
          Logged in successfully.
        </p>
      </div>,
      { toastId: 'portal-login-success' }
    );
  }, []);

  const redirectAfterLogin = useCallback(
    (token: string, user: AuthenticatedPortalUser, nextRoute?: string | null) => {
      setAuth(token, user);

      const destination = resolveLoginRedirect(user, nextRoute);
      if (destination) {
        showLoginSuccessToast(user);
        window.location.assign(destination);
        return;
      }

      if (user.role === 'EMPLOYEE') {
        showLoginSuccessToast(user);
        window.location.assign(
          resolveEmployeeRouteRedirect(nextRoute || '', user.permissions) ||
            getEmployeeLandingPath(user.permissions)
        );
        return;
      }

      if (user.role === 'CUSTOMER') {
        logout();
        setError('Customer accounts use the main JCB Exchange website, not the admin portal.');
        return;
      }

      setError(t('authPortal.portalAccessOnly'));
    },
    [logout, setAuth, showLoginSuccessToast, t]
  );

  useEffect(() => {
    const handoffToken = searchParams.get('token');
    const nextRoute = searchParams.get('next');

    if (!handoffToken) return;

    const consumePortalHandoff = async () => {
      try {
        const response = await api.get('/auth/profile', {
          headers: { Authorization: `Bearer ${handoffToken}` },
        });
        redirectAfterLogin(handoffToken, response.data.user, nextRoute);
      } catch (err: unknown) {
        if (axios.isAxiosError(err)) {
          setError(err.response?.data?.error || t('authPortal.handoffFailed'));
        } else {
          setError(t('authPortal.handoffFailed'));
        }
      }
    };

    void consumePortalHandoff();
  }, [redirectAfterLogin, searchParams, t]);

  useEffect(() => {
    const checkSetupStatus = async () => {
      try {
        const setupResponse = await api.get('/auth/setup-status');
        setIsFirstSetup(!setupResponse.data.hasSuperAdmin);
      } catch (err) {
        console.error('Failed to check setup status', err);
      } finally {
        setStatusLoading(false);
      }
    };

    checkSetupStatus();
  }, []);

  const handleLoginSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccessMessage('');

    const cleanEmail = sanitizeEmail(loginData.email);
    const cleanPassword = sanitizePassword(loginData.password);

    if (!cleanEmail) {
      setError('Please enter your email address.');
      return;
    }

    if (!isValidEmail(cleanEmail)) {
      setError('Please enter a valid email address.');
      return;
    }

    if (!cleanPassword) {
      setError('Please enter your password.');
      return;
    }

    setLoading(true);

    try {
      const response = await api.post('/auth/login', {
        email: cleanEmail,
        password: cleanPassword,
      });
      const { token, user } = response.data;
      redirectAfterLogin(token, user);
    } catch (err: unknown) {
      if (axios.isAxiosError(err)) {
        if (err.response?.data?.code === ACCOUNT_INACTIVE_CODE) {
          setError(err.response?.data?.error || t('authPortal.accountInactive'));
        } else if (err.response?.data?.code === ACCOUNT_REVOKED_CODE) {
          setError(err.response?.data?.error || t('authPortal.accountRevoked'));
        } else {
          setError(err.response?.data?.error || t('authPortal.invalidCredentials'));
        }
      } else {
        setError(t('authPortal.invalidCredentials'));
      }
    } finally {
      setLoading(false);
    }
  };

  const handleSendMobileOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccessMessage('');

    const cleanMobile = sanitizeMobile(loginMobile);
    if (!cleanMobile || cleanMobile.length !== 10 || !isValidIndianMobile(cleanMobile)) {
      setError('Please enter a valid 10-digit mobile number starting with 6, 7, 8, or 9.');
      return;
    }

    setOtpAction('mobile-send');
    try {
      const response = await api.post('/auth/login/mobile-otp/send', { mobile: cleanMobile });
      const data = response.data || {};
      const now = otpNow;
      setOtpNow(now);
      const challengeId = typeof data.challengeId === 'string' ? data.challengeId : '';
      const expirySeconds = normalizeOtpExpirySeconds(data.expiresInSeconds, mobileOtpExpirySeconds);
      const cooldownSeconds = normalizeOtpCooldownSeconds(data.resendCooldownSeconds, mobileOtpCooldownSeconds);

      setLoginMobile(cleanMobile);
      setMobileOtp('');
      setMobileChallengeId(challengeId);
      setMobileMaskedMobile(data.maskedMobile || 'your registered mobile number');
      setMobileOtpLength(normalizeOtpLength(data.otpLength, mobileOtpLength));
      setMobileOtpExpirySeconds(expirySeconds);
      setMobileOtpCooldownSeconds(cooldownSeconds);
      setMobileOtpExpiresAt(challengeId ? now + expirySeconds * 1000 : 0);
      setMobileOtpResendAvailableAt(challengeId ? now + cooldownSeconds * 1000 : 0);

      setSuccessMessage(
        challengeId
          ? `OTP sent to ${data.maskedMobile || 'your registered mobile number'}.`
          : 'If this mobile number is registered, an OTP has been sent.'
      );
    } catch (err: unknown) {
      setError(getOtpErrorMessage(err, 'Unable to send OTP. Please try again.'));
    } finally {
      setOtpAction(null);
    }
  };

  const handleResendMobileOtp = async () => {
    if (!mobileChallengeId || mobileOtpResendSecondsRemaining > 0) return;

    setError('');
    setSuccessMessage('');
    setOtpAction('mobile-resend');

    try {
      const response = await api.post('/auth/login/mobile-otp/resend', {
        challengeId: mobileChallengeId,
        mobile: sanitizeMobile(loginMobile),
      });
      const data = response.data || {};
      const now = otpNow;
      setOtpNow(now);
      const challengeId = typeof data.challengeId === 'string' ? data.challengeId : mobileChallengeId;
      const expirySeconds = normalizeOtpExpirySeconds(data.expiresInSeconds, mobileOtpExpirySeconds);
      const cooldownSeconds = normalizeOtpCooldownSeconds(data.resendCooldownSeconds, mobileOtpCooldownSeconds);

      setMobileOtp('');
      setMobileChallengeId(challengeId);
      setMobileMaskedMobile(data.maskedMobile || mobileMaskedMobile);
      setMobileOtpLength(normalizeOtpLength(data.otpLength, mobileOtpLength));
      setMobileOtpExpirySeconds(expirySeconds);
      setMobileOtpCooldownSeconds(cooldownSeconds);
      setMobileOtpExpiresAt(now + expirySeconds * 1000);
      setMobileOtpResendAvailableAt(now + cooldownSeconds * 1000);
      setSuccessMessage(`A new OTP was sent to ${data.maskedMobile || mobileMaskedMobile}.`);
    } catch (err: unknown) {
      if (axios.isAxiosError(err) && err.response?.status === 429) {
        const retryAfterSeconds = Number(err.response.data?.retryAfterSeconds);
        if (Number.isFinite(retryAfterSeconds) && retryAfterSeconds > 0) {
          setMobileOtpResendAvailableAt(otpNow + retryAfterSeconds * 1000);
        }
      }

      if (axios.isAxiosError(err) && err.response?.data?.code === 'OTP_CHALLENGE_NOT_FOUND') {
        setMobileChallengeId('');
        setMobileOtp('');
        setMobileOtpExpiresAt(0);
        setMobileOtpResendAvailableAt(0);
      }
      setError(getOtpErrorMessage(err, 'Unable to resend OTP. Please request a new OTP.'));
    } finally {
      setOtpAction(null);
    }
  };

  const handleVerifyMobileOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccessMessage('');

    const cleanMobile = sanitizeMobile(loginMobile);
    const cleanOtp = normalizeOtpInput(mobileOtp, mobileOtpLength);
    if (!mobileChallengeId) {
      setError('Please request an OTP first.');
      return;
    }
    if (mobileOtpSecondsRemaining <= 0) {
      setError('This OTP has expired. Please request a new OTP.');
      return;
    }
    if (cleanOtp.length !== mobileOtpLength) {
      setError(`Please enter the ${mobileOtpLength}-digit OTP.`);
      return;
    }

    setOtpAction('mobile-verify');
    try {
      const response = await api.post('/auth/login/mobile-otp/verify', {
        challengeId: mobileChallengeId,
        mobile: cleanMobile,
        otp: cleanOtp,
      });
      redirectAfterLogin(response.data.token, response.data.user, searchParams.get('next'));
    } catch (err: unknown) {
      setError(getOtpErrorMessage(err, 'Invalid or expired OTP. Please try again.'));
    } finally {
      setOtpAction(null);
    }
  };

  const handleSendEmailOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccessMessage('');

    const cleanEmail = sanitizeEmail(emailOtpEmail);
    if (!cleanEmail || !isValidEmail(cleanEmail)) {
      setError('Please enter a valid email address.');
      return;
    }

    setOtpAction('email-send');
    try {
      const response = await api.post('/auth/login/email-otp/send', { email: cleanEmail });
      const data = response.data || {};
      const now = otpNow;
      setOtpNow(now);
      const challengeId = typeof data.challengeId === 'string' ? data.challengeId : '';
      const expirySeconds = normalizeOtpExpirySeconds(data.expiresInSeconds, emailOtpExpirySeconds);
      const cooldownSeconds = normalizeOtpCooldownSeconds(data.resendCooldownSeconds, emailOtpCooldownSeconds);

      setEmailOtpEmail(cleanEmail);
      setEmailOtp('');
      setEmailChallengeId(challengeId);
      setEmailMaskedEmail(data.maskedEmail || 'your registered email address');
      setEmailOtpLength(normalizeOtpLength(data.otpLength, emailOtpLength));
      setEmailOtpExpirySeconds(expirySeconds);
      setEmailOtpCooldownSeconds(cooldownSeconds);
      setEmailOtpExpiresAt(challengeId ? now + expirySeconds * 1000 : 0);
      setEmailOtpResendAvailableAt(challengeId ? now + cooldownSeconds * 1000 : 0);

      setSuccessMessage(
        challengeId
          ? `OTP sent to ${data.maskedEmail || 'your registered email address'}.`
          : 'If this email is registered, an OTP has been sent.'
      );
    } catch (err: unknown) {
      setError(getOtpErrorMessage(err, 'Unable to send OTP. Please try again.'));
    } finally {
      setOtpAction(null);
    }
  };

  const handleResendEmailOtp = async () => {
    if (!emailChallengeId || emailOtpResendSecondsRemaining > 0) return;

    setError('');
    setSuccessMessage('');
    setOtpAction('email-resend');

    try {
      const response = await api.post('/auth/login/email-otp/resend', {
        challengeId: emailChallengeId,
        email: sanitizeEmail(emailOtpEmail),
      });
      const data = response.data || {};
      const now = otpNow;
      setOtpNow(now);
      const challengeId = typeof data.challengeId === 'string' ? data.challengeId : emailChallengeId;
      const expirySeconds = normalizeOtpExpirySeconds(data.expiresInSeconds, emailOtpExpirySeconds);
      const cooldownSeconds = normalizeOtpCooldownSeconds(data.resendCooldownSeconds, emailOtpCooldownSeconds);

      setEmailOtp('');
      setEmailChallengeId(challengeId);
      setEmailMaskedEmail(data.maskedEmail || emailMaskedEmail);
      setEmailOtpLength(normalizeOtpLength(data.otpLength, emailOtpLength));
      setEmailOtpExpirySeconds(expirySeconds);
      setEmailOtpCooldownSeconds(cooldownSeconds);
      setEmailOtpExpiresAt(now + expirySeconds * 1000);
      setEmailOtpResendAvailableAt(now + cooldownSeconds * 1000);
      setSuccessMessage(`A new OTP was sent to ${data.maskedEmail || emailMaskedEmail}.`);
    } catch (err: unknown) {
      if (axios.isAxiosError(err) && err.response?.status === 429) {
        const retryAfterSeconds = Number(err.response.data?.retryAfterSeconds);
        if (Number.isFinite(retryAfterSeconds) && retryAfterSeconds > 0) {
          setEmailOtpResendAvailableAt(otpNow + retryAfterSeconds * 1000);
        }
      }
      if (axios.isAxiosError(err) && err.response?.status === 404) {
        clearEmailOtpChallenge();
      }
      setError(getOtpErrorMessage(err, 'Unable to resend OTP. Please request a new OTP.'));
    } finally {
      setOtpAction(null);
    }
  };

  const handleVerifyEmailOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccessMessage('');

    const cleanEmail = sanitizeEmail(emailOtpEmail);
    const cleanOtp = normalizeOtpInput(emailOtp, emailOtpLength);
    if (!emailChallengeId) {
      setError('Please request an OTP first.');
      return;
    }
    if (emailOtpSecondsRemaining <= 0) {
      setError('This OTP has expired. Please request a new OTP.');
      return;
    }
    if (cleanOtp.length !== emailOtpLength) {
      setError(`Please enter the ${emailOtpLength}-digit OTP.`);
      return;
    }

    setOtpAction('email-verify');
    try {
      const response = await api.post('/auth/login/email-otp/verify', {
        challengeId: emailChallengeId,
        email: cleanEmail,
        otp: cleanOtp,
      });
      redirectAfterLogin(response.data.token, response.data.user, searchParams.get('next'));
    } catch (err: unknown) {
      setError(getOtpErrorMessage(err, 'Invalid or expired OTP. Please try again.'));
    } finally {
      setOtpAction(null);
    }
  };

  const handleSendPasswordResetOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccessMessage('');

    const cleanMobile = sanitizeMobile(passwordResetMobile);
    if (!cleanMobile || cleanMobile.length !== 10 || !isValidIndianMobile(cleanMobile)) {
      setError('Please enter a valid 10-digit mobile number starting with 6, 7, 8, or 9.');
      return;
    }

    setPasswordResetAction('send');
    try {
      const response = await api.post('/auth/password-reset/mobile-otp/send', { mobile: cleanMobile });
      const data = response.data || {};
      const now = otpNow;
      const challengeId = typeof data.challengeId === 'string' ? data.challengeId : '';
      const expirySeconds = normalizeOtpExpirySeconds(data.expiresInSeconds, mobileOtpExpirySeconds);
      const cooldownSeconds = normalizeOtpCooldownSeconds(data.resendCooldownSeconds, mobileOtpCooldownSeconds);

      setPasswordResetMobile(cleanMobile);
      setPasswordResetOtp('');
      setPasswordResetChallengeId(challengeId);
      setPasswordResetMaskedMobile(data.maskedMobile || 'your registered mobile number');
      setPasswordResetOtpLength(normalizeOtpLength(data.otpLength, mobileOtpLength));
      setPasswordResetOtpExpiresAt(challengeId ? now + expirySeconds * 1000 : 0);
      setPasswordResetResendAvailableAt(challengeId ? now + cooldownSeconds * 1000 : 0);

      if (challengeId) {
        setPasswordResetStep('otp');
        setSuccessMessage(`OTP sent to ${data.maskedMobile || 'your registered mobile number'}.`);
      } else {
        setSuccessMessage('If this mobile number is registered, an OTP has been sent.');
      }
    } catch (err: unknown) {
      setError(getOtpErrorMessage(err, 'Unable to send password reset OTP. Please try again.'));
    } finally {
      setPasswordResetAction(null);
    }
  };

  const handleResendPasswordResetOtp = async () => {
    if (!passwordResetChallengeId || passwordResetResendSecondsRemaining > 0) return;

    setError('');
    setSuccessMessage('');
    setPasswordResetAction('resend');

    try {
      const response = await api.post('/auth/password-reset/mobile-otp/resend', {
        challengeId: passwordResetChallengeId,
        mobile: sanitizeMobile(passwordResetMobile),
      });
      const data = response.data || {};
      const now = otpNow;
      const challengeId = typeof data.challengeId === 'string' ? data.challengeId : passwordResetChallengeId;
      const expirySeconds = normalizeOtpExpirySeconds(data.expiresInSeconds, mobileOtpExpirySeconds);
      const cooldownSeconds = normalizeOtpCooldownSeconds(data.resendCooldownSeconds, mobileOtpCooldownSeconds);

      setPasswordResetOtp('');
      setPasswordResetChallengeId(challengeId);
      setPasswordResetMaskedMobile(data.maskedMobile || passwordResetMaskedMobile);
      setPasswordResetOtpLength(normalizeOtpLength(data.otpLength, passwordResetOtpLength));
      setPasswordResetOtpExpiresAt(now + expirySeconds * 1000);
      setPasswordResetResendAvailableAt(now + cooldownSeconds * 1000);
      setSuccessMessage(`A new OTP was sent to ${data.maskedMobile || passwordResetMaskedMobile}.`);
    } catch (err: unknown) {
      if (axios.isAxiosError(err) && err.response?.status === 429) {
        const retryAfterSeconds = Number(err.response.data?.retryAfterSeconds);
        if (Number.isFinite(retryAfterSeconds) && retryAfterSeconds > 0) {
          setPasswordResetResendAvailableAt(otpNow + retryAfterSeconds * 1000);
        }
      }

      if (axios.isAxiosError(err) && err.response?.data?.code === 'PASSWORD_RESET_CHALLENGE_NOT_FOUND') {
        setPasswordResetStep('mobile');
        setPasswordResetChallengeId('');
        setPasswordResetOtp('');
        setPasswordResetOtpExpiresAt(0);
        setPasswordResetResendAvailableAt(0);
      }
      setError(getOtpErrorMessage(err, 'Unable to resend OTP. Please request a new OTP.'));
    } finally {
      setPasswordResetAction(null);
    }
  };

  const handleVerifyPasswordResetOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccessMessage('');

    const cleanMobile = sanitizeMobile(passwordResetMobile);
    const cleanOtp = normalizeOtpInput(passwordResetOtp, passwordResetOtpLength);
    if (!passwordResetChallengeId) {
      setError('Please request an OTP first.');
      return;
    }
    if (passwordResetOtpSecondsRemaining <= 0) {
      setError('This OTP has expired. Please request a new OTP.');
      return;
    }
    if (cleanOtp.length !== passwordResetOtpLength) {
      setError(`Please enter the ${passwordResetOtpLength}-digit OTP.`);
      return;
    }

    setPasswordResetAction('verify');
    try {
      const response = await api.post('/auth/password-reset/mobile-otp/verify', {
        challengeId: passwordResetChallengeId,
        mobile: cleanMobile,
        otp: cleanOtp,
      });
      const resetToken = typeof response.data?.resetToken === 'string' ? response.data.resetToken : '';
      if (!resetToken) {
        throw new Error('Password reset session was not issued.');
      }

      setPasswordResetToken(resetToken);
      setPasswordResetStep('password');
      setPasswordResetOtp('');
      setPasswordResetOtpExpiresAt(0);
      setPasswordResetResendAvailableAt(0);
      setSuccessMessage('OTP verified. Set a new password for your account.');
    } catch (err: unknown) {
      setError(getOtpErrorMessage(err, 'Invalid or expired OTP. Please try again.'));
    } finally {
      setPasswordResetAction(null);
    }
  };

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccessMessage('');

    const validationError = validatePasswordResetInput(passwordResetNewPassword, passwordResetConfirmPassword);
    if (validationError) {
      setError(validationError);
      return;
    }
    if (!passwordResetToken) {
      setError('Password reset session is invalid. Please request a new OTP.');
      return;
    }

    setPasswordResetAction('save');
    try {
      await api.post('/auth/password-reset/reset', {
        resetToken: passwordResetToken,
        newPassword: passwordResetNewPassword,
        confirmPassword: passwordResetConfirmPassword,
      });

      setIsPasswordReset(false);
      setPasswordResetStep('mobile');
      setPasswordResetMobile('');
      setPasswordResetOtp('');
      setPasswordResetChallengeId('');
      setPasswordResetMaskedMobile('');
      setPasswordResetToken('');
      setPasswordResetNewPassword('');
      setPasswordResetConfirmPassword('');
      setPasswordResetOtpExpiresAt(0);
      setPasswordResetResendAvailableAt(0);
      setLoginMethod('password');
      setLoginData((current) => ({ ...current, password: '' }));
      setError('');
      setSuccessMessage('Password reset successfully. Please sign in with your new password.');
    } catch (err: unknown) {
      setError(getOtpErrorMessage(err, 'Unable to reset password. Please try again.'));
    } finally {
      setPasswordResetAction(null);
    }
  };

  const handleRegisterSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccessMessage('');

    const cleanName = sanitizeName(registerData.name);
    const cleanEmail = sanitizeEmail(registerData.email);
    const cleanMobile = sanitizeMobile(registerData.mobile);
    const cleanPassword = sanitizePassword(registerData.password);
    const cleanConfirmPassword = sanitizePassword(registerData.confirmPassword);

    if (!cleanName) {
      setError('Please enter your full name or company contact.');
      return;
    }

    if (!cleanMobile || cleanMobile.length !== 10) {
      setError(t('authPortal.validMobile'));
      return;
    }

    if (!isValidIndianMobile(cleanMobile)) {
      setError('Please enter a valid 10-digit mobile number starting with 6, 7, 8, or 9.');
      return;
    }

    const cleanWhatsappNumber = whatsappSameAsMobile
      ? cleanMobile
      : sanitizeMobile(whatsappNumber);

    if (!cleanWhatsappNumber || cleanWhatsappNumber.length !== 10) {
      setError('Please enter a valid 10-digit WhatsApp number.');
      return;
    }

    if (!isValidEmail(cleanEmail)) {
      setError('Please enter a valid email address.');
      return;
    }

    if (cleanPassword.length < 8) {
      setError('Password must be at least 8 characters long.');
      return;
    }

    if (cleanPassword !== cleanConfirmPassword) {
      setError('Passwords do not match. Please re-enter.');
      return;
    }

    setLoading(true);

    try {
      const response = await api.post('/auth/register', {
        name: cleanName,
        email: cleanEmail,
        mobile: cleanMobile,
        password: cleanPassword,
        whatsappSameAsMobile,
        whatsappNumber: cleanWhatsappNumber,
        registrationType: 'PARTNER',
      });

      const { token, user } = response.data;
      setAuth(token, user);

      if (user.role === 'SUPER_ADMIN') {
        router.push('/admin/dashboard');
      } else {
        router.push('/partner/kyc');
      }
    } catch (err: unknown) {
      if (axios.isAxiosError(err)) {
        setError(err.response?.data?.error || t('authPortal.createAccountFailed'));
      } else {
        setError(t('authPortal.createAccountFailed'));
      }
    } finally {
      setLoading(false);
    }
  };

  const clearMobileOtpChallenge = () => {
    setMobileOtp('');
    setMobileChallengeId('');
    setMobileMaskedMobile('');
    setMobileOtpExpiresAt(0);
    setMobileOtpResendAvailableAt(0);
  };

  const clearEmailOtpChallenge = () => {
    setEmailOtp('');
    setEmailChallengeId('');
    setEmailMaskedEmail('');
    setEmailOtpExpiresAt(0);
    setEmailOtpResendAvailableAt(0);
  };

  const switchLoginMethod = (method: LoginMethod) => {
    setLoginMethod(method);
    clearMobileOtpChallenge();
    clearEmailOtpChallenge();
    setError('');
    setSuccessMessage('');
  };

  const clearPasswordResetState = () => {
    setPasswordResetStep('mobile');
    setPasswordResetMobile('');
    setPasswordResetOtp('');
    setPasswordResetChallengeId('');
    setPasswordResetMaskedMobile('');
    setPasswordResetOtpExpiresAt(0);
    setPasswordResetResendAvailableAt(0);
    setPasswordResetToken('');
    setPasswordResetNewPassword('');
    setPasswordResetConfirmPassword('');
    setShowPasswordResetPassword(false);
    setShowPasswordResetConfirmPassword(false);
    setPasswordResetAction(null);
  };

  const openPasswordReset = () => {
    switchLoginMethod('password');
    clearPasswordResetState();
    setIsPasswordReset(true);
    setError('');
    setSuccessMessage('');
  };

  const closePasswordReset = () => {
    clearPasswordResetState();
    setIsPasswordReset(false);
    setLoginMethod('password');
    setError('');
    setSuccessMessage('');
  };

  const handleTabSwitch = (newTab: AuthTab) => {
    setActiveTab(newTab);
    setLoginMethod('password');
    clearMobileOtpChallenge();
    clearEmailOtpChallenge();
    clearPasswordResetState();
    setIsPasswordReset(false);
    setError('');
    setSuccessMessage('');
    const url = new URL(window.location.href);
    if (newTab === 'register') {
      url.searchParams.set('tab', 'register');
    } else {
      url.searchParams.delete('tab');
    }
    window.history.replaceState({}, '', url.toString());
  };

  if (statusLoading) {
    return <BrandLoader variant="fullscreen" size="lg" bg="dark" text={t('common.loading')} />;
  }

  return (
    <div className="h-screen w-full flex items-center justify-center bg-zinc-950 font-sans relative px-4 py-3 sm:py-4 overflow-hidden selection:bg-amber-400 selection:text-black">
      {/* Background Image with Clean Viewport Constraint */}
      <div 
        className="absolute inset-0 bg-[url('/jcb-bg.webp')] bg-cover bg-center opacity-40 mix-blend-luminosity pointer-events-none" 
      />
      
      {/* Dark Ambient Gradient Mesh */}
      <div className="absolute inset-0 bg-gradient-to-t from-zinc-950 via-zinc-950/80 to-zinc-900/90 pointer-events-none" />
      <div className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[300px] bg-amber-500/10 blur-[120px] rounded-full pointer-events-none" />

      {/* Main Auth Card Container - Fits viewport without window scroll */}
      <div className="relative z-10 w-full max-w-[420px] max-h-[calc(100dvh-1.5rem)] flex flex-col">
        <div className="bg-white rounded-2xl sm:rounded-3xl shadow-[0_20px_60px_-15px_rgba(0,0,0,0.6),0_0_0_1px_rgba(255,255,255,0.1)] overflow-hidden flex flex-col max-h-full">
          
          {/* Subtle Top JCB Brand Stripe */}
          <div className="h-1.5 w-full bg-gradient-to-r from-amber-400 via-yellow-400 to-amber-500 shrink-0" />

          <div className="p-5 sm:p-7 overflow-y-auto [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden">
            {/* Logo & Portal Identity */}
            <div className="flex flex-col items-center text-center mb-4">
              <Link href="/" className="inline-block hover:opacity-90 transition-opacity mb-2.5">
                <Image
                  src="/Logo-black.webp"
                  alt="JCB Exchange"
                  width={280}
                  height={157}
                  priority
                  className="w-[180px] sm:w-[200px] h-auto max-h-[58px] object-contain mx-auto"
                />
              </Link>
              <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[10px] font-semibold bg-zinc-100 text-zinc-700 border border-zinc-200/60">
                <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse" />
                <span>{isFirstSetup ? 'Setup Mode' : 'Partner & Employee Portal'}</span>
              </div>
            </div>

            {/* Setup Mode Notice (If DB is empty) */}
            {isFirstSetup ? (
              <div className="text-center py-2">
                <h1 className="text-xl font-bold text-zinc-900 mb-2">
                  {t('authPortal.setupRequiredTitle')}
                </h1>
                <p className="text-zinc-500 text-xs mb-5 leading-relaxed">
                  {t('authPortal.setupRequiredDescription')}
                </p>
                <Link href="/signup" className="block">
                  <button className="h-11 w-full font-bold px-4 rounded-xl bg-red-600 hover:bg-red-700 text-white text-sm transition-colors shadow-sm flex items-center justify-center">
                    {t('authPortal.initializeSetup')}
                  </button>
                </Link>
              </div>
            ) : (
              <>
                {/* Modern Pill Segmented Tabs */}
                <div className="grid grid-cols-2 p-1 bg-zinc-100 rounded-xl mb-4 border border-zinc-200/50 h-10 items-center">
                  <button
                    type="button"
                    onClick={() => handleTabSwitch('login')}
                    className={`h-8 text-xs rounded-lg transition-all flex items-center justify-center gap-1.5 ${
                      activeTab === 'login'
                        ? 'bg-white text-zinc-900 font-bold shadow-sm'
                        : 'text-zinc-500 hover:text-zinc-900 font-medium'
                    }`}
                  >
                    <span>Sign In</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => handleTabSwitch('register')}
                    className={`h-8 text-xs rounded-lg transition-all flex items-center justify-center gap-1.5 ${
                      activeTab === 'register'
                        ? 'bg-white text-zinc-900 font-bold shadow-sm'
                        : 'text-zinc-500 hover:text-zinc-900 font-medium'
                    }`}
                  >
                    <span>Partner Register</span>
                  </button>
                </div>

                {/* Error Banner */}
                {error && (
                  <div className="mb-3.5 p-3 bg-red-50 border border-red-200 text-red-700 text-xs font-semibold rounded-xl flex items-center gap-2">
                    <AlertCircle className="h-4 w-4 shrink-0 text-red-500" />
                    <span>{error}</span>
                  </div>
                )}

                {/* Success Banner */}
                {successMessage && (
                  <div className="mb-3.5 p-3 bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-semibold rounded-xl flex items-center gap-2">
                    <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" />
                    <span>{successMessage}</span>
                  </div>
                )}

                {/* SIGN IN FORM */}
                {activeTab === 'login' ? (
                  <>
                  {isPasswordReset ? (
                  <>
                  <form
                    onSubmit={
                      passwordResetStep === 'mobile'
                        ? handleSendPasswordResetOtp
                        : passwordResetStep === 'otp'
                          ? handleVerifyPasswordResetOtp
                          : handleResetPassword
                    }
                    className="space-y-3.5"
                    autoComplete="on"
                  >
                    {passwordResetStep === 'mobile' ? (
                      <>
                        <div>
                          <label className="block text-xs font-semibold text-zinc-700 mb-1.5">
                            Mobile Number
                          </label>
                          <div className="relative flex">
                            <span className="inline-flex items-center px-3 rounded-l-xl border border-r-0 border-zinc-200 bg-zinc-100 text-zinc-600 text-xs font-bold select-none h-11">
                              +91
                            </span>
                            <div className="relative flex-1">
                              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-zinc-400">
                                <Smartphone className="h-4 w-4" />
                              </div>
                              <input
                                type="tel"
                                inputMode="numeric"
                                maxLength={10}
                                required
                                value={passwordResetMobile}
                                onChange={(e) => {
                                  setPasswordResetMobile(sanitizeMobile(e.target.value).slice(0, 10));
                                  if (error) setError('');
                                }}
                                className="h-11 block w-full pl-9 pr-3.5 bg-zinc-50/70 hover:bg-zinc-50 focus:bg-white border border-zinc-200 hover:border-zinc-300 rounded-r-xl text-zinc-900 placeholder:text-zinc-400 text-sm focus:outline-none focus:border-amber-500 focus:ring-4 focus:ring-amber-500/15 transition-all"
                                placeholder="Enter 10-digit mobile number"
                                autoComplete="tel-national"
                              />
                            </div>
                          </div>
                        </div>
                        <p className="rounded-xl border border-blue-100 bg-blue-50 p-3 text-center text-[11px] font-medium text-blue-700">
                          If this mobile number is registered, an OTP will be sent by SMS.
                        </p>
                      </>
                    ) : passwordResetStep === 'otp' ? (
                      <div>
                        <label className="block text-xs font-semibold text-zinc-700 mb-1.5" htmlFor="password-reset-otp">
                          Enter OTP
                        </label>
                        <input
                          id="password-reset-otp"
                          type="text"
                          inputMode="numeric"
                          autoComplete="one-time-code"
                          maxLength={passwordResetOtpLength}
                          required
                          value={passwordResetOtp}
                          onChange={(e) => {
                            setPasswordResetOtp(normalizeOtpInput(e.target.value, passwordResetOtpLength));
                            if (error) setError('');
                          }}
                          className="h-11 block w-full px-3.5 bg-zinc-50/70 hover:bg-zinc-50 focus:bg-white border border-zinc-200 hover:border-zinc-300 rounded-xl text-zinc-900 tracking-[0.35em] text-center text-base font-bold focus:outline-none focus:border-amber-500 focus:ring-4 focus:ring-amber-500/15 transition-all"
                          placeholder={'•'.repeat(passwordResetOtpLength)}
                        />
                        <div className="mt-1.5 flex items-center justify-between gap-2 text-[10px] font-medium text-zinc-500">
                          <span>OTP sent to {passwordResetMaskedMobile || 'your mobile number'}</span>
                          <span className={passwordResetOtpSecondsRemaining <= 30 ? 'text-red-600' : 'text-zinc-500'}>
                            {passwordResetOtpSecondsRemaining > 0
                              ? `Expires in ${Math.floor(passwordResetOtpSecondsRemaining / 60)}:${String(passwordResetOtpSecondsRemaining % 60).padStart(2, '0')}`
                              : 'OTP expired'}
                          </span>
                        </div>
                        <div className="mt-2 flex items-center justify-between gap-3 text-[11px] font-semibold">
                          <button
                            type="button"
                            onClick={handleResendPasswordResetOtp}
                            disabled={passwordResetResendSecondsRemaining > 0 || passwordResetAction === 'resend'}
                            className="text-amber-700 hover:text-amber-900 disabled:text-zinc-400 disabled:cursor-not-allowed transition-colors"
                          >
                            {passwordResetAction === 'resend'
                              ? 'Sending…'
                              : passwordResetResendSecondsRemaining > 0
                                ? `Resend OTP in ${passwordResetResendSecondsRemaining}s`
                                : 'Resend OTP'}
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setPasswordResetStep('mobile');
                              setPasswordResetChallengeId('');
                              setPasswordResetOtp('');
                              setPasswordResetOtpExpiresAt(0);
                              setPasswordResetResendAvailableAt(0);
                              setError('');
                              setSuccessMessage('');
                            }}
                            className="text-zinc-500 hover:text-zinc-800 transition-colors"
                          >
                            Change mobile
                          </button>
                        </div>
                      </div>
                    ) : (
                      <>
                        <p className="text-center text-[11px] font-medium text-zinc-500">
                          Set a new password for your account.
                        </p>
                        <div>
                          <label className="block text-xs font-semibold text-zinc-700 mb-1.5" htmlFor="password-reset-new">
                            New Password
                          </label>
                          <div className="relative">
                            <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-zinc-400">
                              <Lock className="h-4 w-4" />
                            </div>
                            <input
                              id="password-reset-new"
                              type={showPasswordResetPassword ? 'text' : 'password'}
                              required
                              value={passwordResetNewPassword}
                              onChange={(e) => {
                                setPasswordResetNewPassword(e.target.value);
                                if (error) setError('');
                              }}
                              className="h-11 block w-full pl-10 pr-10 bg-zinc-50/70 hover:bg-zinc-50 focus:bg-white border border-zinc-200 hover:border-zinc-300 rounded-xl text-zinc-900 placeholder:text-zinc-400 text-sm focus:outline-none focus:border-amber-500 focus:ring-4 focus:ring-amber-500/15 transition-all"
                              placeholder="Minimum 8 characters"
                              autoComplete="new-password"
                            />
                            <button
                              type="button"
                              onClick={() => setShowPasswordResetPassword(!showPasswordResetPassword)}
                              className="absolute inset-y-0 right-0 pr-3.5 flex items-center text-zinc-400 hover:text-zinc-700 focus:outline-none"
                              aria-label={showPasswordResetPassword ? 'Hide new password' : 'Show new password'}
                            >
                              {showPasswordResetPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                            </button>
                          </div>
                        </div>
                        <div>
                          <label className="block text-xs font-semibold text-zinc-700 mb-1.5" htmlFor="password-reset-confirm">
                            Confirm New Password
                          </label>
                          <div className="relative">
                            <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-zinc-400">
                              <Lock className="h-4 w-4" />
                            </div>
                            <input
                              id="password-reset-confirm"
                              type={showPasswordResetConfirmPassword ? 'text' : 'password'}
                              required
                              value={passwordResetConfirmPassword}
                              onChange={(e) => {
                                setPasswordResetConfirmPassword(e.target.value);
                                if (error) setError('');
                              }}
                              className="h-11 block w-full pl-10 pr-10 bg-zinc-50/70 hover:bg-zinc-50 focus:bg-white border border-zinc-200 hover:border-zinc-300 rounded-xl text-zinc-900 placeholder:text-zinc-400 text-sm focus:outline-none focus:border-amber-500 focus:ring-4 focus:ring-amber-500/15 transition-all"
                              placeholder="Re-enter new password"
                              autoComplete="new-password"
                            />
                            <button
                              type="button"
                              onClick={() => setShowPasswordResetConfirmPassword(!showPasswordResetConfirmPassword)}
                              className="absolute inset-y-0 right-0 pr-3.5 flex items-center text-zinc-400 hover:text-zinc-700 focus:outline-none"
                              aria-label={showPasswordResetConfirmPassword ? 'Hide confirmation password' : 'Show confirmation password'}
                            >
                              {showPasswordResetConfirmPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                            </button>
                          </div>
                        </div>
                      </>
                    )}

                    <button
                      type="submit"
                      disabled={passwordResetAction !== null}
                      className="h-11 w-full font-bold px-4 rounded-xl mt-2 bg-gradient-to-r from-amber-400 via-amber-400 to-yellow-400 hover:from-amber-500 hover:to-yellow-500 active:scale-[0.99] text-zinc-950 text-sm transition-all shadow-sm disabled:opacity-50 flex items-center justify-center gap-2 cursor-pointer tracking-wide"
                    >
                      {passwordResetAction ? (
                        <div className="w-4 h-4 border-2 border-zinc-950 border-t-transparent rounded-full animate-spin" />
                      ) : (
                        <>
                          <span>
                            {passwordResetStep === 'mobile'
                              ? 'Send OTP'
                              : passwordResetStep === 'otp'
                                ? 'Verify OTP'
                                : 'Update Password'}
                          </span>
                          <ArrowRight className="h-4 w-4" />
                        </>
                      )}
                    </button>
                  </form>
                  <button
                    type="button"
                    onClick={closePasswordReset}
                    className="mt-3 w-full text-[11px] font-semibold text-zinc-500 hover:text-zinc-800 transition-colors"
                  >
                    Back to Sign In
                  </button>
                  </>
                  ) : (
                    <>
                  {activeLoginMethod === 'mobileOtp' ? (
                  <form
                    onSubmit={mobileChallengeId ? handleVerifyMobileOtp : handleSendMobileOtp}
                    className="space-y-3.5"
                    autoComplete="on"
                  >
                    <div>
                      <label className="block text-xs font-semibold text-zinc-700 mb-1.5">
                        Mobile Number
                      </label>
                      <div className="relative flex">
                        <span className="inline-flex items-center px-3 rounded-l-xl border border-r-0 border-zinc-200 bg-zinc-100 text-zinc-600 text-xs font-bold select-none h-11">
                          +91
                        </span>
                        <div className="relative flex-1">
                          <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-zinc-400">
                            <Phone className="h-4 w-4" />
                          </div>
                          <input
                            type="tel"
                            inputMode="numeric"
                            maxLength={10}
                            required
                            value={loginMobile}
                            onChange={(e) => {
                              setLoginMobile(sanitizeMobile(e.target.value).slice(0, 10));
                              if (error) setError('');
                            }}
                            className="h-11 block w-full pl-9 pr-3.5 bg-zinc-50/70 hover:bg-zinc-50 focus:bg-white border border-zinc-200 hover:border-zinc-300 rounded-r-xl text-zinc-900 placeholder:text-zinc-400 text-sm focus:outline-none focus:border-amber-500 focus:ring-4 focus:ring-amber-500/15 transition-all"
                            placeholder="Enter 10-digit mobile number"
                            autoComplete="tel-national"
                          />
                        </div>
                      </div>
                    </div>

                    {mobileChallengeId && (
                      <div>
                        <label className="block text-xs font-semibold text-zinc-700 mb-1.5" htmlFor="mobile-login-otp">
                          Enter OTP
                        </label>
                        <input
                          id="mobile-login-otp"
                          type="text"
                          inputMode="numeric"
                          autoComplete="one-time-code"
                          maxLength={mobileOtpLength}
                          required
                          value={mobileOtp}
                          onChange={(e) => {
                            setMobileOtp(normalizeOtpInput(e.target.value, mobileOtpLength));
                            if (error) setError('');
                          }}
                          className="h-11 block w-full px-3.5 bg-zinc-50/70 hover:bg-zinc-50 focus:bg-white border border-zinc-200 hover:border-zinc-300 rounded-xl text-zinc-900 tracking-[0.35em] text-center text-base font-bold focus:outline-none focus:border-amber-500 focus:ring-4 focus:ring-amber-500/15 transition-all"
                          placeholder={'•'.repeat(mobileOtpLength)}
                        />
                        <div className="mt-1.5 flex items-center justify-between gap-2 text-[10px] font-medium text-zinc-500">
                          <span>OTP sent to {mobileMaskedMobile || 'your mobile number'}</span>
                          <span className={mobileOtpSecondsRemaining <= 30 ? 'text-red-600' : 'text-zinc-500'}>
                            {mobileOtpSecondsRemaining > 0
                              ? `Expires in ${Math.floor(mobileOtpSecondsRemaining / 60)}:${String(mobileOtpSecondsRemaining % 60).padStart(2, '0')}`
                              : 'OTP expired'}
                          </span>
                        </div>
                      </div>
                    )}

                    <button
                      type="submit"
                      disabled={otpAction === 'mobile-send' || otpAction === 'mobile-verify'}
                      className="h-11 w-full font-bold px-4 rounded-xl mt-2 bg-gradient-to-r from-amber-400 via-amber-400 to-yellow-400 hover:from-amber-500 hover:to-yellow-500 active:scale-[0.99] text-zinc-950 text-sm transition-all shadow-sm disabled:opacity-50 flex items-center justify-center gap-2 cursor-pointer tracking-wide"
                    >
                      {otpAction === 'mobile-send' || otpAction === 'mobile-verify' ? (
                        <div className="w-4 h-4 border-2 border-zinc-950 border-t-transparent rounded-full animate-spin" />
                      ) : (
                        <>
                          <span>{mobileChallengeId ? 'Verify OTP' : 'Send OTP'}</span>
                          <ArrowRight className="h-4 w-4" />
                        </>
                      )}
                    </button>

                    {mobileChallengeId && (
                      <div className="flex items-center justify-between gap-3 text-[11px] font-semibold">
                        <button
                          type="button"
                          onClick={handleResendMobileOtp}
                          disabled={mobileOtpResendSecondsRemaining > 0 || otpAction === 'mobile-resend'}
                          className="text-amber-700 hover:text-amber-900 disabled:text-zinc-400 disabled:cursor-not-allowed transition-colors"
                        >
                          {otpAction === 'mobile-resend'
                            ? 'Sending…'
                            : mobileOtpResendSecondsRemaining > 0
                              ? `Resend OTP in ${mobileOtpResendSecondsRemaining}s`
                              : 'Resend OTP'}
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            clearMobileOtpChallenge();
                            setSuccessMessage('');
                          }}
                          className="text-zinc-500 hover:text-zinc-800 transition-colors"
                        >
                          Change mobile
                        </button>
                      </div>
                    )}
                  </form>
                  ) : activeLoginMethod === 'emailOtp' ? (
                  <form
                    onSubmit={emailChallengeId ? handleVerifyEmailOtp : handleSendEmailOtp}
                    className="space-y-3.5"
                    autoComplete="on"
                  >
                    <div>
                      <label className="block text-xs font-semibold text-zinc-700 mb-1.5">
                        Email Address
                      </label>
                      <div className="relative">
                        <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-zinc-400">
                          <Mail className="h-4 w-4" />
                        </div>
                        <input
                          type="email"
                          required
                          value={emailOtpEmail}
                          onChange={(e) => {
                            setEmailOtpEmail(e.target.value);
                            if (error) setError('');
                          }}
                          onBlur={(e) => setEmailOtpEmail(sanitizeEmail(e.target.value))}
                          className="h-11 block w-full pl-10 pr-3.5 bg-zinc-50/70 hover:bg-zinc-50 focus:bg-white border border-zinc-200 hover:border-zinc-300 rounded-xl text-zinc-900 placeholder:text-zinc-400 text-sm focus:outline-none focus:border-amber-500 focus:ring-4 focus:ring-amber-500/15 transition-all"
                          placeholder="Enter your email address"
                          autoComplete="email"
                        />
                      </div>
                    </div>

                    {emailChallengeId && (
                      <div>
                        <label className="block text-xs font-semibold text-zinc-700 mb-1.5" htmlFor="email-login-otp">
                          Enter OTP
                        </label>
                        <input
                          id="email-login-otp"
                          type="text"
                          inputMode="numeric"
                          autoComplete="one-time-code"
                          maxLength={emailOtpLength}
                          required
                          value={emailOtp}
                          onChange={(e) => {
                            setEmailOtp(normalizeOtpInput(e.target.value, emailOtpLength));
                            if (error) setError('');
                          }}
                          className="h-11 block w-full px-3.5 bg-zinc-50/70 hover:bg-zinc-50 focus:bg-white border border-zinc-200 hover:border-zinc-300 rounded-xl text-zinc-900 tracking-[0.35em] text-center text-base font-bold focus:outline-none focus:border-amber-500 focus:ring-4 focus:ring-amber-500/15 transition-all"
                          placeholder={'•'.repeat(emailOtpLength)}
                        />
                        <div className="mt-1.5 flex items-center justify-between gap-2 text-[10px] font-medium text-zinc-500">
                          <span>OTP sent to {emailMaskedEmail || 'your email address'}</span>
                          <span className={emailOtpSecondsRemaining <= 30 ? 'text-red-600' : 'text-zinc-500'}>
                            {emailOtpSecondsRemaining > 0
                              ? `Expires in ${Math.floor(emailOtpSecondsRemaining / 60)}:${String(emailOtpSecondsRemaining % 60).padStart(2, '0')}`
                              : 'OTP expired'}
                          </span>
                        </div>
                      </div>
                    )}

                    <button
                      type="submit"
                      disabled={otpAction === 'email-send' || otpAction === 'email-verify'}
                      className="h-11 w-full font-bold px-4 rounded-xl mt-2 bg-gradient-to-r from-amber-400 via-amber-400 to-yellow-400 hover:from-amber-500 hover:to-yellow-500 active:scale-[0.99] text-zinc-950 text-sm transition-all shadow-sm disabled:opacity-50 flex items-center justify-center gap-2 cursor-pointer tracking-wide"
                    >
                      {otpAction === 'email-send' || otpAction === 'email-verify' ? (
                        <div className="w-4 h-4 border-2 border-zinc-950 border-t-transparent rounded-full animate-spin" />
                      ) : (
                        <>
                          <span>{emailChallengeId ? 'Verify OTP' : 'Send OTP'}</span>
                          <ArrowRight className="h-4 w-4" />
                        </>
                      )}
                    </button>

                    {emailChallengeId && (
                      <div className="flex items-center justify-between gap-3 text-[11px] font-semibold">
                        <button
                          type="button"
                          onClick={handleResendEmailOtp}
                          disabled={emailOtpResendSecondsRemaining > 0 || otpAction === 'email-resend'}
                          className="text-amber-700 hover:text-amber-900 disabled:text-zinc-400 disabled:cursor-not-allowed transition-colors"
                        >
                          {otpAction === 'email-resend'
                            ? 'Sending…'
                            : emailOtpResendSecondsRemaining > 0
                              ? `Resend OTP in ${emailOtpResendSecondsRemaining}s`
                              : 'Resend OTP'}
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            clearEmailOtpChallenge();
                            setSuccessMessage('');
                          }}
                          className="text-zinc-500 hover:text-zinc-800 transition-colors"
                        >
                          Change email
                        </button>
                      </div>
                    )}
                  </form>
                  ) : (
                  <form onSubmit={handleLoginSubmit} className="space-y-3.5" autoComplete="on">
                    <div>
                      <label htmlFor={emailInputId} className="block text-xs font-semibold text-zinc-700 mb-1.5">
                        {t('authPortal.emailAddress')}
                      </label>
                      <div className="relative">
                        <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-zinc-400">
                          <Mail className="h-4 w-4" />
                        </div>
                        <input
                          id={emailInputId}
                          type="email"
                          name="email"
                          required
                          value={loginData.email}
                          onChange={(e) => {
                            setLoginData({ ...loginData, email: e.target.value });
                            if (error) setError('');
                          }}
                          onBlur={(e) => {
                            setLoginData({ ...loginData, email: sanitizeEmail(e.target.value) });
                          }}
                          className="h-11 block w-full pl-10 pr-3.5 bg-zinc-50/70 hover:bg-zinc-50 focus:bg-white border border-zinc-200 hover:border-zinc-300 rounded-xl text-zinc-900 placeholder:text-zinc-400 text-sm focus:outline-none focus:border-amber-500 focus:ring-4 focus:ring-amber-500/15 transition-all"
                          placeholder="Enter your email address"
                          autoComplete="username"
                        />
                      </div>
                    </div>

                    <div>
                      <div className="flex justify-between items-center mb-1.5">
                        <label htmlFor={passwordInputId} className="block text-xs font-semibold text-zinc-700">
                          {t('authPortal.password')}
                        </label>
                        {loginCapsLock && (
                          <span className="text-[10px] font-semibold text-amber-700">
                            Caps Lock is ON
                          </span>
                        )}
                      </div>
                      <div className="relative">
                        <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-zinc-400">
                          <Lock className="h-4 w-4" />
                        </div>
                        <input
                          id={passwordInputId}
                          type={showLoginPassword ? 'text' : 'password'}
                          name="password"
                          required
                          value={loginData.password}
                          onChange={(e) => {
                            setLoginData({ ...loginData, password: e.target.value });
                            if (error) setError('');
                          }}
                          onKeyUp={(e) => {
                            if (typeof e.getModifierState === 'function') {
                              setLoginCapsLock(e.getModifierState('CapsLock'));
                            }
                          }}
                          className="h-11 block w-full pl-10 pr-10 bg-zinc-50/70 hover:bg-zinc-50 focus:bg-white border border-zinc-200 hover:border-zinc-300 rounded-xl text-zinc-900 placeholder:text-zinc-400 text-sm focus:outline-none focus:border-amber-500 focus:ring-4 focus:ring-amber-500/15 transition-all"
                          placeholder="Enter your password"
                          autoComplete="current-password"
                        />
                        <button
                          type="button"
                          onClick={() => setShowLoginPassword(!showLoginPassword)}
                          className="absolute inset-y-0 right-0 pr-3.5 flex items-center text-zinc-400 hover:text-zinc-700 focus:outline-none"
                          aria-label={showLoginPassword ? 'Hide password' : 'Show password'}
                        >
                          {showLoginPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                        </button>
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={openPasswordReset}
                      className="text-left text-[11px] font-semibold text-amber-700 hover:text-amber-900 transition-colors"
                    >
                      Forgot password?
                    </button>

                    <button
                      type="submit"
                      disabled={loading}
                      className="h-11 w-full font-bold px-4 rounded-xl mt-2 bg-gradient-to-r from-amber-400 via-amber-400 to-yellow-400 hover:from-amber-500 hover:to-yellow-500 active:scale-[0.99] text-zinc-950 text-sm transition-all shadow-sm disabled:opacity-50 flex items-center justify-center gap-2 cursor-pointer tracking-wide"
                    >
                      {loading ? (
                        <div className="w-4 h-4 border-2 border-zinc-950 border-t-transparent rounded-full animate-spin" />
                      ) : (
                        <>
                          <span>Sign In</span>
                          <ArrowRight className="h-4 w-4" />
                        </>
                      )}
                    </button>
                  </form>
                  )}

                  {(mobileOtpEnabled || emailOtpEnabled) && (
                    <div className="mt-3 flex flex-wrap items-center justify-center gap-x-3 gap-y-1.5 text-[11px] font-semibold">
                      {mobileOtpEnabled && (
                        <button
                          type="button"
                          onClick={() => switchLoginMethod(activeLoginMethod === 'mobileOtp' ? 'password' : 'mobileOtp')}
                          className="text-amber-700 hover:text-amber-900 transition-colors"
                        >
                          {activeLoginMethod === 'mobileOtp' ? 'Use password instead' : 'Login with Mobile OTP'}
                        </button>
                      )}
                      {emailOtpEnabled && (
                        <button
                          type="button"
                          onClick={() => switchLoginMethod(activeLoginMethod === 'emailOtp' ? 'password' : 'emailOtp')}
                          className="text-amber-700 hover:text-amber-900 transition-colors"
                        >
                          {activeLoginMethod === 'emailOtp' ? 'Use password instead' : 'Login with Email OTP'}
                        </button>
                      )}
                    </div>
                  )}
                  </>
                  )}
                  </>
                ) : (
                  /* PARTNER REGISTER FORM */
                  <form onSubmit={handleRegisterSubmit} className="space-y-3">
                    <div>
                      <label className="block text-xs font-semibold text-zinc-700 mb-1">
                        Full or Business Contact Name
                      </label>
                      <div className="relative">
                        <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-zinc-400">
                          <User className="h-4 w-4" />
                        </div>
                        <input
                          type="text"
                          required
                          value={registerData.name}
                          onChange={(e) => {
                            setRegisterData({ ...registerData, name: e.target.value });
                            if (error) setError('');
                          }}
                          onBlur={(e) => {
                            setRegisterData({ ...registerData, name: sanitizeName(e.target.value) });
                          }}
                          className="h-11 block w-full pl-10 pr-3.5 bg-zinc-50/70 hover:bg-zinc-50 focus:bg-white border border-zinc-200 hover:border-zinc-300 rounded-xl text-zinc-900 placeholder:text-zinc-400 text-sm focus:outline-none focus:border-amber-500 focus:ring-4 focus:ring-amber-500/15 transition-all"
                          placeholder="Enter your full name"
                          autoComplete="name"
                        />
                      </div>
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-zinc-700 mb-1">
                        Mobile Number
                      </label>
                      <div className="relative flex">
                        <span className="inline-flex items-center px-3 rounded-l-xl border border-r-0 border-zinc-200 bg-zinc-100 text-zinc-600 text-xs font-bold select-none h-11">
                          +91
                        </span>
                        <div className="relative flex-1">
                          <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-zinc-400">
                            <Phone className="h-4 w-4" />
                          </div>
                          <input
                            type="tel"
                            inputMode="numeric"
                            maxLength={10}
                            required
                            value={registerData.mobile}
                            onChange={(e) => {
                              const onlyNums = e.target.value.replace(/[^0-9]/g, '').slice(0, 10);
                              setRegisterData({ ...registerData, mobile: onlyNums });
                              if (error) setError('');
                            }}
                            className="h-11 block w-full pl-9 pr-3.5 bg-zinc-50/70 hover:bg-zinc-50 focus:bg-white border border-zinc-200 hover:border-zinc-300 rounded-r-xl text-zinc-900 placeholder:text-zinc-400 text-sm focus:outline-none focus:border-amber-500 focus:ring-4 focus:ring-amber-500/15 transition-all"
                            placeholder="Enter 10-digit mobile number"
                            autoComplete="tel-national"
                          />
                        </div>
                      </div>
                    </div>

                    <div className="space-y-1.5 pt-0.5">
                      <label className="flex items-center gap-2 text-xs font-medium text-zinc-600 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={whatsappSameAsMobile}
                          onChange={(e) => setWhatsappSameAsMobile(e.target.checked)}
                          className="h-4 w-4 rounded border-zinc-300 text-amber-500 focus:ring-amber-400 cursor-pointer"
                        />
                        <span>This mobile number is also my WhatsApp number</span>
                      </label>

                      {!whatsappSameAsMobile && (
                        <div className="relative flex pt-1 animate-in fade-in">
                          <span className="inline-flex items-center px-3 rounded-l-xl border border-r-0 border-zinc-200 bg-zinc-100 text-zinc-600 text-xs font-bold select-none h-11">
                            +91
                          </span>
                          <div className="relative flex-1">
                            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-zinc-400">
                              <MessageCircle className="h-4 w-4" />
                            </div>
                            <input
                              type="tel"
                              inputMode="numeric"
                              maxLength={10}
                              required
                              value={whatsappNumber}
                              onChange={(e) => setWhatsappNumber(e.target.value.replace(/[^0-9]/g, '').slice(0, 10))}
                              className="h-11 block w-full pl-9 pr-3.5 bg-white border border-zinc-200 hover:border-zinc-300 rounded-r-xl text-zinc-900 placeholder:text-zinc-400 text-sm focus:outline-none focus:border-amber-500 focus:ring-2 focus:ring-amber-500/15"
                              placeholder="Enter 10-digit WhatsApp number"
                            />
                          </div>
                        </div>
                      )}
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-zinc-700 mb-1">
                        Email Address
                      </label>
                      <div className="relative">
                        <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-zinc-400">
                          <Mail className="h-4 w-4" />
                        </div>
                        <input
                          type="email"
                          required
                          value={registerData.email}
                          onChange={(e) => {
                            setRegisterData({ ...registerData, email: e.target.value });
                            if (error) setError('');
                          }}
                          onBlur={(e) => {
                            setRegisterData({ ...registerData, email: sanitizeEmail(e.target.value) });
                          }}
                          className="h-11 block w-full pl-10 pr-3.5 bg-zinc-50/70 hover:bg-zinc-50 focus:bg-white border border-zinc-200 hover:border-zinc-300 rounded-xl text-zinc-900 placeholder:text-zinc-400 text-sm focus:outline-none focus:border-amber-500 focus:ring-4 focus:ring-amber-500/15 transition-all"
                          placeholder="Enter your email address"
                          autoComplete="email"
                        />
                      </div>
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-zinc-700 mb-1">
                        Password
                      </label>
                      <div className="relative">
                        <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-zinc-400">
                          <Lock className="h-4 w-4" />
                        </div>
                        <input
                          type={showRegisterPassword ? 'text' : 'password'}
                          required
                          value={registerData.password}
                          onChange={(e) => {
                            setRegisterData({ ...registerData, password: e.target.value });
                            if (error) setError('');
                          }}
                          className="h-11 block w-full pl-10 pr-10 bg-zinc-50/70 hover:bg-zinc-50 focus:bg-white border border-zinc-200 hover:border-zinc-300 rounded-xl text-zinc-900 placeholder:text-zinc-400 text-sm focus:outline-none focus:border-amber-500 focus:ring-4 focus:ring-amber-500/15 transition-all"
                          placeholder="Create password (min 8 characters)"
                          autoComplete="new-password"
                        />
                        <button
                          type="button"
                          onClick={() => setShowRegisterPassword(!showRegisterPassword)}
                          className="absolute inset-y-0 right-0 pr-3.5 flex items-center text-zinc-400 hover:text-zinc-700 focus:outline-none"
                        >
                          {showRegisterPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                        </button>
                      </div>
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-zinc-700 mb-1">
                        Confirm Password
                      </label>
                      <div className="relative">
                        <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-zinc-400">
                          <Lock className="h-4 w-4" />
                        </div>
                        <input
                          type={showConfirmPassword ? 'text' : 'password'}
                          required
                          value={registerData.confirmPassword}
                          onChange={(e) => {
                            setRegisterData({ ...registerData, confirmPassword: e.target.value });
                            if (error) setError('');
                          }}
                          className="h-11 block w-full pl-10 pr-10 bg-zinc-50/70 hover:bg-zinc-50 focus:bg-white border border-zinc-200 hover:border-zinc-300 rounded-xl text-zinc-900 placeholder:text-zinc-400 text-sm focus:outline-none focus:border-amber-500 focus:ring-4 focus:ring-amber-500/15 transition-all"
                          placeholder="Re-enter password to confirm"
                          autoComplete="new-password"
                        />
                        <button
                          type="button"
                          onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                          className="absolute inset-y-0 right-0 pr-3.5 flex items-center text-zinc-400 hover:text-zinc-700 focus:outline-none"
                        >
                          {showConfirmPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                        </button>
                      </div>
                    </div>

                    <button
                      type="submit"
                      disabled={loading}
                      className="h-11 w-full font-bold px-4 rounded-xl mt-2 bg-gradient-to-r from-amber-400 via-amber-400 to-yellow-400 hover:from-amber-500 hover:to-yellow-500 active:scale-[0.99] text-zinc-950 text-sm transition-all shadow-sm disabled:opacity-50 flex items-center justify-center gap-2 cursor-pointer tracking-wide"
                    >
                      {loading ? (
                        <div className="w-4 h-4 border-2 border-zinc-950 border-t-transparent rounded-full animate-spin" />
                      ) : (
                        <>
                          <span>Register as Partner</span>
                          <ArrowRight className="h-4 w-4" />
                        </>
                      )}
                    </button>
                  </form>
                )}

                {/* Subtle Divider & Secondary Switcher Action */}
                <div className="relative my-4">
                  <div className="absolute inset-0 flex items-center">
                    <div className="w-full border-t border-zinc-200/80" />
                  </div>
                  <div className="relative flex justify-center text-[10px] font-semibold uppercase tracking-wider">
                    <span className="bg-white px-2.5 text-zinc-400">
                      {activeTab === 'login' ? 'New partner?' : 'Already have an account?'}
                    </span>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => handleTabSwitch(activeTab === 'login' ? 'register' : 'login')}
                  className="h-11 w-full px-4 rounded-xl border border-zinc-200 hover:border-zinc-300 hover:bg-zinc-50 active:bg-zinc-100 text-sm font-semibold text-zinc-800 transition-all flex items-center justify-center gap-2 cursor-pointer"
                >
                  {activeTab === 'login' ? 'Register as Partner' : 'Sign In to Account'}
                </button>
              </>
            )}

            {/* Bottom Security Note */}
            <div className="mt-4 pt-3 border-t border-zinc-100 flex items-center justify-center gap-1.5 text-center">
              <ShieldCheck className="h-3.5 w-3.5 text-emerald-600" />
              <p className="text-[10px] text-zinc-400 font-medium">
                256-bit Encrypted Session • Enterprise Access
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function LoadingFallback() {
  const { t } = useTranslation();
  return <BrandLoader variant="fullscreen" size="lg" bg="dark" text={t('common.loading')} />;
}

export default function LoginPage() {
  return (
    <Suspense fallback={<LoadingFallback />}>
      <LoginPageInner />
    </Suspense>
  );
}
