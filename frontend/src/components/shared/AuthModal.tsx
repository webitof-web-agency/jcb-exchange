"use client";

import React, { useCallback, useEffect, useRef, useState } from 'react';
import Image from 'next/image';
import Script from 'next/script';
import { useAuthStore } from '@/store/authStore';
import { useToastStore } from '@/store/toastStore';
import { X, Mail, Lock, User, Eye, EyeOff, Smartphone } from 'lucide-react';
import api from '@/lib/api';
import { useTranslation } from '@/hooks/useTranslation';
import { getAuthDisplayName } from '@/lib/authDisplayName';

declare global {
  interface Window {
    google?: {
      accounts: {
        id: {
          initialize: (options: {
            client_id: string;
            callback: (response: { credential?: string }) => void;
          }) => void;
          renderButton: (
            element: HTMLElement,
            options: Record<string, string | number | boolean>
          ) => void;
        };
      };
    };
  }
}

type AuthResponseUser = {
  id: string;
  email?: string | null;
  name?: string | null;
  mobile?: string | null;
  whatsappNumber?: string | null;
  role?: string;
};

type MobileOtpConfigResponse = {
  enabled: boolean;
  otpLength?: number;
  otpExpirySeconds?: number;
  resendCooldownSeconds?: number;
};

type EmailOtpConfigResponse = MobileOtpConfigResponse;
type PasswordResetStep = 'mobile' | 'otp' | 'password';

export default function AuthModal() {
  const { t } = useTranslation();
  const { isAuthModalOpen, authMode, setAuthModalOpen, setAuth } = useAuthStore();
  const showToast = useToastStore((state) => state.showToast);
  const isLogin = authMode === 'login';
  const [isPasswordReset, setIsPasswordReset] = useState(false);
  const [passwordResetStep, setPasswordResetStep] = useState<PasswordResetStep>('mobile');
  const [passwordResetMobile, setPasswordResetMobile] = useState('');
  const [passwordResetRequestMessage, setPasswordResetRequestMessage] = useState('');
  const [passwordResetOtp, setPasswordResetOtp] = useState('');
  const [passwordResetChallengeId, setPasswordResetChallengeId] = useState('');
  const [passwordResetMaskedMobile, setPasswordResetMaskedMobile] = useState('');
  const [passwordResetOtpExpiresAt, setPasswordResetOtpExpiresAt] = useState(0);
  const [passwordResetResendAvailableAt, setPasswordResetResendAvailableAt] = useState(0);
  const [passwordResetToken, setPasswordResetToken] = useState('');
  const [passwordResetNewPassword, setPasswordResetNewPassword] = useState('');
  const [passwordResetConfirmPassword, setPasswordResetConfirmPassword] = useState('');
  const [isPasswordResetSending, setIsPasswordResetSending] = useState(false);
  const [isPasswordResetVerifying, setIsPasswordResetVerifying] = useState(false);
  const [isPasswordResetResending, setIsPasswordResetResending] = useState(false);
  const [isPasswordResetSaving, setIsPasswordResetSaving] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [mobile, setMobile] = useState('');
  const [whatsappNumber, setWhatsappNumber] = useState('');
  const [whatsappSameAsMobile, setWhatsappSameAsMobile] = useState(true);
  const [otp, setOtp] = useState('');
  const [otpRequestMessage, setOtpRequestMessage] = useState('');
  const [emailOtp, setEmailOtp] = useState('');
  const [error, setError] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isOtpSending, setIsOtpSending] = useState(false);
  const [isOtpVerifying, setIsOtpVerifying] = useState(false);
  const [isOtpResending, setIsOtpResending] = useState(false);
  const [isMobileOtpEnabled, setIsMobileOtpEnabled] = useState(false);
  const [isEmailOtpEnabled, setIsEmailOtpEnabled] = useState(false);
  const [otpLength, setOtpLength] = useState(6);
  const [otpExpirySeconds, setOtpExpirySeconds] = useState(15 * 60);
  const [otpExpiresAt, setOtpExpiresAt] = useState(0);
  const [otpResendCooldownSeconds, setOtpResendCooldownSeconds] = useState(45);
  const [otpResendAvailableAt, setOtpResendAvailableAt] = useState(0);
  const [loginMethod, setLoginMethod] = useState<'password' | 'mobileOtp' | 'emailOtp'>('password');
  const [otpChallengeId, setOtpChallengeId] = useState('');
  const [otpMaskedMobile, setOtpMaskedMobile] = useState('');
  const [emailOtpChallengeId, setEmailOtpChallengeId] = useState('');
  const [emailOtpMaskedEmail, setEmailOtpMaskedEmail] = useState('');
  const [emailOtpLength, setEmailOtpLength] = useState(6);
  const [emailOtpExpirySeconds, setEmailOtpExpirySeconds] = useState(10 * 60);
  const [emailOtpExpiresAt, setEmailOtpExpiresAt] = useState(0);
  const [emailOtpResendCooldownSeconds, setEmailOtpResendCooldownSeconds] = useState(45);
  const [emailOtpResendAvailableAt, setEmailOtpResendAvailableAt] = useState(0);
  const [isEmailOtpSending, setIsEmailOtpSending] = useState(false);
  const [isEmailOtpVerifying, setIsEmailOtpVerifying] = useState(false);
  const [isEmailOtpResending, setIsEmailOtpResending] = useState(false);
  const [googleClientId, setGoogleClientId] = useState<string | null>(null);
  const [isGoogleScriptReady, setIsGoogleScriptReady] = useState(
    typeof window !== 'undefined' && !!window.google
  );
  const googleButtonRef = useRef<HTMLDivElement | null>(null);
  const googleInitializedRef = useRef(false);
  const [otpResendNow, setOtpResendNow] = useState(0);
  const otpResendSecondsRemaining = otpResendAvailableAt
    ? Math.max(0, Math.ceil((otpResendAvailableAt - otpResendNow) / 1000))
    : 0;
  const otpSecondsRemaining = otpExpiresAt
    ? Math.max(0, Math.ceil((otpExpiresAt - otpResendNow) / 1000))
    : otpExpirySeconds;
  const emailOtpResendSecondsRemaining = emailOtpResendAvailableAt
    ? Math.max(0, Math.ceil((emailOtpResendAvailableAt - otpResendNow) / 1000))
    : 0;
  const emailOtpSecondsRemaining = emailOtpExpiresAt
    ? Math.max(0, Math.ceil((emailOtpExpiresAt - otpResendNow) / 1000))
    : emailOtpExpirySeconds;
  const passwordResetOtpSecondsRemaining = passwordResetOtpExpiresAt
    ? Math.max(0, Math.ceil((passwordResetOtpExpiresAt - otpResendNow) / 1000))
    : otpExpirySeconds;
  const passwordResetResendSecondsRemaining = passwordResetResendAvailableAt
    ? Math.max(0, Math.ceil((passwordResetResendAvailableAt - otpResendNow) / 1000))
    : 0;

  const isGoogleConfigured =
    !!googleClientId && !googleClientId.startsWith('YOUR_');
  const canRenderGoogleLogin = isGoogleConfigured;
  const activeLoginMethod =
    loginMethod === 'mobileOtp' && isMobileOtpEnabled
      ? 'mobileOtp'
      : loginMethod === 'emailOtp' && isEmailOtpEnabled
        ? 'emailOtp'
        : 'password';

  const showLoginSuccessToast = useCallback((userName?: string | null, email?: string | null, mobile?: string | null) => {
    const displayName = getAuthDisplayName({ name: userName, email, mobile });
    showToast({
      title: `Welcome back, ${displayName}! 👋`,
      description: `Logged in successfully. Explore active JCB and heavy equipment listings.`,
      variant: 'success',
    });
  }, [showToast]);

  const resetOtpState = useCallback(() => {
    setOtp('');
    setOtpRequestMessage('');
    setOtpChallengeId('');
    setOtpMaskedMobile('');
    setOtpExpiresAt(0);
    setOtpResendAvailableAt(0);
    setEmailOtp('');
    setEmailOtpChallengeId('');
    setEmailOtpMaskedEmail('');
    setEmailOtpExpiresAt(0);
    setEmailOtpResendAvailableAt(0);
    setLoginMethod('password');
    setEmail('');
    setPassword('');
    setShowPassword(false);
    setIsPasswordReset(false);
    setPasswordResetStep('mobile');
    setPasswordResetMobile('');
    setPasswordResetRequestMessage('');
    setPasswordResetOtp('');
    setPasswordResetChallengeId('');
    setPasswordResetMaskedMobile('');
    setPasswordResetOtpExpiresAt(0);
    setPasswordResetResendAvailableAt(0);
    setPasswordResetToken('');
    setPasswordResetNewPassword('');
    setPasswordResetConfirmPassword('');
  }, []);

  const completeAuth = useCallback((token: string, user: AuthResponseUser, shouldNotify = true) => {
    resetOtpState();
    setAuth(token, user);
    setAuthModalOpen(false);
    if (shouldNotify) {
      showLoginSuccessToast(user.name, user.email, user.mobile);
    }
  }, [resetOtpState, setAuth, setAuthModalOpen, showLoginSuccessToast]);

  const handleGoogleCredential = useCallback(async (credential?: string) => {
    if (!credential) {
      setError(t('auth.googleCredentialMissing'));
      return;
    }

    setError('');
    setIsSubmitting(true);

    try {
      const response = await api.post('/auth/google', { credential });
      const { token, user } = response.data as { token: string; user: AuthResponseUser };
      completeAuth(token, user, true);
    } catch (err: unknown) {
      const errorMessage =
        err && typeof err === 'object' && 'response' in err
          ? (err as { response?: { data?: { error?: string; message?: string } } }).response?.data?.error ||
            (err as { response?: { data?: { error?: string; message?: string } } }).response?.data?.message ||
            t('auth.googleLoginFailed')
          : t('auth.googleLoginFailed');
      setError(errorMessage);
    } finally {
      setIsSubmitting(false);
    }
  }, [completeAuth, t]);

  useEffect(() => {
    let cancelled = false;

    const loadGoogleConfig = async () => {
      try {
        const [googleResponse, otpConfigResponse, emailOtpConfigResponse] = await Promise.allSettled([
          api.get<{ enabled: boolean; clientId: string | null }>('/auth/google-config'),
          api.get<MobileOtpConfigResponse>('/auth/mobile-otp/config'),
          api.get<EmailOtpConfigResponse>('/auth/email-otp/config'),
        ]);

        if (!cancelled) {
          if (googleResponse.status === 'fulfilled') {
            setGoogleClientId(googleResponse.value.data.enabled ? googleResponse.value.data.clientId : null);
          } else {
            setGoogleClientId(null);
          }

          if (otpConfigResponse.status === 'fulfilled') {
            setIsMobileOtpEnabled(otpConfigResponse.value.data.enabled === true);
            setOtpLength(Math.min(10, Math.max(4, otpConfigResponse.value.data.otpLength || 6)));
            setOtpExpirySeconds(Math.max(60, otpConfigResponse.value.data.otpExpirySeconds || 15 * 60));
            setOtpResendCooldownSeconds(Math.max(1, otpConfigResponse.value.data.resendCooldownSeconds || 45));
          } else {
            setIsMobileOtpEnabled(false);
          }

          if (emailOtpConfigResponse.status === 'fulfilled') {
            setIsEmailOtpEnabled(emailOtpConfigResponse.value.data.enabled === true);
            setEmailOtpLength(Math.min(10, Math.max(4, emailOtpConfigResponse.value.data.otpLength || 6)));
            setEmailOtpExpirySeconds(Math.max(60, emailOtpConfigResponse.value.data.otpExpirySeconds || 10 * 60));
            setEmailOtpResendCooldownSeconds(Math.max(1, emailOtpConfigResponse.value.data.resendCooldownSeconds || 45));
          } else {
            setIsEmailOtpEnabled(false);
          }
        }
      } catch {
        if (!cancelled) {
          setGoogleClientId(null);
          setIsMobileOtpEnabled(false);
          setIsEmailOtpEnabled(false);
        }
      }
    };

    void loadGoogleConfig();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!isAuthModalOpen || (!otpChallengeId && !emailOtpChallengeId && !passwordResetChallengeId)) {
      return;
    }

    const timer = window.setInterval(() => setOtpResendNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [emailOtpChallengeId, isAuthModalOpen, otpChallengeId, passwordResetChallengeId]);

  useEffect(() => {
    if (!isAuthModalOpen) {
      const resetTimer = window.setTimeout(resetOtpState, 0);
      return () => window.clearTimeout(resetTimer);
    }

    return undefined;
  }, [isAuthModalOpen, resetOtpState]);

  useEffect(() => {
    if (
      !isAuthModalOpen ||
      !canRenderGoogleLogin ||
      !isGoogleScriptReady ||
      !window.google ||
      !googleButtonRef.current
    ) {
      return;
    }

    if (googleInitializedRef.current) {
      return;
    }

    googleButtonRef.current.innerHTML = '';

    window.google.accounts.id.initialize({
      client_id: googleClientId,
      callback: (response) => {
        void handleGoogleCredential(response.credential);
      },
    });

    window.google.accounts.id.renderButton(googleButtonRef.current, {
      theme: 'outline',
      size: 'large',
      shape: 'rectangular',
      text: 'continue_with',
      width: 400,
    });

    googleInitializedRef.current = true;
  }, [
    googleClientId,
    handleGoogleCredential,
    isAuthModalOpen,
    canRenderGoogleLogin,
    isGoogleScriptReady,
  ]);

  if (!isAuthModalOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setIsSubmitting(true);

    try {
      if (isLogin) {
        const response = await api.post('/auth/login', { email, password });
        const { token, user } = response.data as { token: string; user: AuthResponseUser };
        completeAuth(token, user, true);
      } else {
        if (password.length < 8) {
          setError(t('auth.passwordLength'));
          setIsSubmitting(false);
          return;
        }

        if (!email.includes('@')) {
          setError(t('auth.validEmail'));
          setIsSubmitting(false);
          return;
        }

        if (mobile.replace(/\D/g, '').length !== 10) {
          setError(t('auth.validMobile'));
          setIsSubmitting(false);
          return;
        }

        const cleanMobile = mobile.replace(/\D/g, '').slice(-10);
        const cleanWhatsappNumber = whatsappSameAsMobile
          ? cleanMobile
          : whatsappNumber.replace(/\D/g, '').slice(-10);
        if (cleanWhatsappNumber.length !== 10) {
          setError(t('auth.validWhatsappNumber', 'Please enter a valid 10-digit WhatsApp number.'));
          setIsSubmitting(false);
          return;
        }

        const response = await api.post('/auth/register', {
          email,
          password,
          name,
          mobile: cleanMobile,
          whatsappSameAsMobile,
          whatsappNumber: cleanWhatsappNumber,
        });
        const { token, user } = response.data as { token: string; user: AuthResponseUser };
        completeAuth(token, user);
      }
    } catch (err: unknown) {
      const errorMessage =
        err && typeof err === 'object' && 'response' in err
          ? (err as { response?: { data?: { error?: string } } }).response?.data?.error ||
            t('auth.authFailed')
          : t('auth.authFailed');
      setError(errorMessage);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSendPasswordResetOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setPasswordResetRequestMessage('');
    setIsPasswordResetSending(true);

    try {
      const normalizedMobile = passwordResetMobile.replace(/\D/g, '');
      if (normalizedMobile.length !== 10) {
        setError(t('auth.validMobile'));
        return;
      }

      const response = await api.post('/auth/password-reset/mobile-otp/send', {
        mobile: normalizedMobile,
      });
      const challengeId = response.data.challengeId || '';
      const expiresInSeconds = Number(response.data.expiresInSeconds) || otpExpirySeconds;
      const resendCooldownSeconds = Math.max(
        1,
        Number(response.data.resendCooldownSeconds) || otpResendCooldownSeconds,
      );

      setPasswordResetMobile(normalizedMobile);
      setPasswordResetChallengeId(challengeId);
      setPasswordResetMaskedMobile(response.data.maskedMobile || '');
      setPasswordResetOtp('');
      setPasswordResetOtpExpiresAt(challengeId ? Date.now() + expiresInSeconds * 1000 : 0);
      setPasswordResetResendAvailableAt(challengeId ? Date.now() + resendCooldownSeconds * 1000 : 0);
      if (challengeId) {
        setPasswordResetRequestMessage('');
        setPasswordResetStep('otp');
      } else {
        setPasswordResetRequestMessage(
          response.data.message || 'If this number is registered, an OTP will be sent by SMS.',
        );
      }
    } catch (err: unknown) {
      const errorMessage =
        err && typeof err === 'object' && 'response' in err
          ? (err as { response?: { data?: { error?: string } } }).response?.data?.error ||
            t('auth.sendOtpFailed')
          : t('auth.sendOtpFailed');
      setError(errorMessage);
    } finally {
      setIsPasswordResetSending(false);
    }
  };

  const handleResendPasswordResetOtp = async () => {
    setError('');
    setIsPasswordResetResending(true);

    try {
      const response = await api.post('/auth/password-reset/mobile-otp/resend', {
        challengeId: passwordResetChallengeId,
        mobile: passwordResetMobile,
      });
      const expiresInSeconds = Number(response.data.expiresInSeconds) || otpExpirySeconds;
      const resendCooldownSeconds = Math.max(
        1,
        Number(response.data.resendCooldownSeconds) || otpResendCooldownSeconds,
      );

      setPasswordResetChallengeId(response.data.challengeId || passwordResetChallengeId);
      setPasswordResetMaskedMobile(response.data.maskedMobile || passwordResetMaskedMobile);
      setPasswordResetOtp('');
      setPasswordResetOtpExpiresAt(Date.now() + expiresInSeconds * 1000);
      setPasswordResetResendAvailableAt(Date.now() + resendCooldownSeconds * 1000);
    } catch (err: unknown) {
      const responseData = err && typeof err === 'object' && 'response' in err
        ? (err as { response?: { data?: { error?: string; code?: string } } }).response?.data
        : undefined;
      setError(responseData?.error || t('auth.resendOtpFailed'));
      if (responseData?.code === 'PASSWORD_RESET_CHALLENGE_NOT_FOUND') {
        setPasswordResetStep('mobile');
        setPasswordResetChallengeId('');
        setPasswordResetRequestMessage(responseData?.error || 'Please request a new OTP.');
        setPasswordResetOtp('');
        setPasswordResetOtpExpiresAt(0);
        setPasswordResetResendAvailableAt(0);
        setError('');
      }
    } finally {
      setIsPasswordResetResending(false);
    }
  };

  const handleVerifyPasswordResetOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setIsPasswordResetVerifying(true);

    try {
      const response = await api.post('/auth/password-reset/mobile-otp/verify', {
        challengeId: passwordResetChallengeId,
        mobile: passwordResetMobile,
        otp: passwordResetOtp,
      });
      const resetToken = response.data.resetToken || '';
      if (!resetToken) {
        throw new Error('Password reset session was not issued.');
      }

      setPasswordResetToken(resetToken);
      setPasswordResetStep('password');
      setPasswordResetOtp('');
      setShowPassword(false);
      setPasswordResetOtpExpiresAt(0);
      setPasswordResetResendAvailableAt(0);
    } catch (err: unknown) {
      const errorMessage =
        err && typeof err === 'object' && 'response' in err
          ? (err as { response?: { data?: { error?: string } } }).response?.data?.error ||
            t('auth.verifyOtpFailed')
          : t('auth.verifyOtpFailed');
      setError(errorMessage);
    } finally {
      setIsPasswordResetVerifying(false);
    }
  };

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (passwordResetNewPassword.length < 8) {
      setError(t('auth.passwordLength'));
      return;
    }

    if (passwordResetNewPassword !== passwordResetConfirmPassword) {
      setError('New password and confirm password must match.');
      return;
    }

    setIsPasswordResetSaving(true);

    try {
      await api.post('/auth/password-reset/reset', {
        resetToken: passwordResetToken,
        newPassword: passwordResetNewPassword,
        confirmPassword: passwordResetConfirmPassword,
      });

      resetOtpState();
      setError('');
      showToast({
        title: 'Password reset successfully.',
        description: 'Log in with your new password.',
        variant: 'success',
      });
    } catch (err: unknown) {
      const errorMessage =
        err && typeof err === 'object' && 'response' in err
          ? (err as { response?: { data?: { error?: string } } }).response?.data?.error ||
            'Unable to reset password.'
          : 'Unable to reset password.';
      setError(errorMessage);
    } finally {
      setIsPasswordResetSaving(false);
    }
  };

  const handleSendOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setOtpRequestMessage('');
    setIsOtpSending(true);

    try {
      if (mobile.replace(/\D/g, '').length !== 10) {
        setError(t('auth.validMobile'));
        setIsOtpSending(false);
        return;
      }

      const response = await api.post('/auth/login/mobile-otp/send', { mobile });
      const challengeId = response.data.challengeId || '';
      setOtpChallengeId(challengeId);
      setOtpMaskedMobile(response.data.maskedMobile || '');
      setOtpRequestMessage(challengeId ? '' : response.data.message || t('auth.sendOtpFailed'));
      setOtpLength(Math.min(10, Math.max(4, Number(response.data.otpLength) || otpLength)));
      setOtpExpirySeconds(Number(response.data.expiresInSeconds) || otpExpirySeconds);
      const resendCooldownSeconds = Math.max(
        1,
        Number(response.data.resendCooldownSeconds) || otpResendCooldownSeconds,
      );
      setOtpResendCooldownSeconds(resendCooldownSeconds);
      setOtpResendNow(Date.now());
      if (challengeId) {
        setOtpExpiresAt(Date.now() + (Number(response.data.expiresInSeconds) || otpExpirySeconds) * 1000);
        setOtpResendAvailableAt(Date.now() + resendCooldownSeconds * 1000);
      } else {
        setOtpExpiresAt(0);
        setOtpResendAvailableAt(0);
      }
    } catch (err: unknown) {
      const errorMessage =
        err && typeof err === 'object' && 'response' in err
          ? (err as { response?: { data?: { error?: string } } }).response?.data?.error ||
            t('auth.sendOtpFailed')
          : t('auth.sendOtpFailed');
      setError(errorMessage);
    } finally {
      setIsOtpSending(false);
    }
  };

  const handleResendOtp = async () => {
    setError('');
    setOtpRequestMessage('');
    setIsOtpResending(true);

    try {
      const response = await api.post('/auth/login/mobile-otp/resend', {
        challengeId: otpChallengeId,
        mobile,
      });
      setOtpChallengeId(response.data.challengeId || otpChallengeId);
      setOtpMaskedMobile(response.data.maskedMobile || otpMaskedMobile);
      setOtpLength(Math.min(10, Math.max(4, Number(response.data.otpLength) || otpLength)));
      setOtpExpirySeconds(Number(response.data.expiresInSeconds) || otpExpirySeconds);
      const resendCooldownSeconds = Math.max(
        1,
        Number(response.data.resendCooldownSeconds) || otpResendCooldownSeconds,
      );
      setOtpResendCooldownSeconds(resendCooldownSeconds);
      setOtpResendNow(Date.now());
      setOtpExpiresAt(Date.now() + (Number(response.data.expiresInSeconds) || otpExpirySeconds) * 1000);
      setOtpResendAvailableAt(Date.now() + resendCooldownSeconds * 1000);
      setOtp('');
    } catch (err: unknown) {
      const responseData = err && typeof err === 'object' && 'response' in err
        ? (err as { response?: { status?: number; data?: { error?: string; code?: string; retryAfterSeconds?: number } } }).response
        : undefined;
      const responseBody = responseData?.data;
      const errorMessage =
        err && typeof err === 'object' && 'response' in err
          ? responseBody?.error ||
            t('auth.resendOtpFailed')
          : t('auth.resendOtpFailed');
      const retryAfterSeconds = Number(responseBody?.retryAfterSeconds);
      if (responseData?.status === 429 && Number.isFinite(retryAfterSeconds) && retryAfterSeconds > 0) {
        setOtpResendAvailableAt(Date.now() + retryAfterSeconds * 1000);
      }
      if (responseBody?.code === 'OTP_CHALLENGE_NOT_FOUND') {
        setOtpChallengeId('');
        setOtpMaskedMobile('');
        setOtp('');
        setOtpExpiresAt(0);
        setOtpResendAvailableAt(0);
        setOtpRequestMessage(errorMessage);
        return;
      }
      setError(errorMessage);
    } finally {
      setIsOtpResending(false);
    }
  };

  const handleVerifyOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setIsOtpVerifying(true);

    try {
      const response = await api.post('/auth/login/mobile-otp/verify', {
        challengeId: otpChallengeId,
        mobile,
        otp,
      });
      const { token, user } = response.data as { token: string; user: AuthResponseUser };
      completeAuth(token, user, true);
    } catch (err: unknown) {
      const errorMessage =
        err && typeof err === 'object' && 'response' in err
          ? (err as { response?: { data?: { error?: string } } }).response?.data?.error ||
            t('auth.verifyOtpFailed')
          : t('auth.verifyOtpFailed');
      setError(errorMessage);
    } finally {
      setIsOtpVerifying(false);
    }
  };

  const handleSendEmailOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setIsEmailOtpSending(true);

    try {
      if (!email.includes('@')) {
        setError(t('auth.validEmail'));
        setIsEmailOtpSending(false);
        return;
      }

      const response = await api.post('/auth/login/email-otp/send', { email });
      const expiresInSeconds = Number(response.data.expiresInSeconds) || emailOtpExpirySeconds;
      setEmailOtpChallengeId(response.data.challengeId || '');
      setEmailOtpMaskedEmail(response.data.maskedEmail || '');
      setEmailOtpLength(Math.min(10, Math.max(4, Number(response.data.otpLength) || emailOtpLength)));
      setEmailOtpExpirySeconds(expiresInSeconds);
      setOtpResendNow(Date.now());
      setEmailOtpExpiresAt(Date.now() + expiresInSeconds * 1000);
      setEmailOtpResendAvailableAt(Date.now() + emailOtpResendCooldownSeconds * 1000);
    } catch (err: unknown) {
      const errorMessage =
        err && typeof err === 'object' && 'response' in err
          ? (err as { response?: { data?: { error?: string } } }).response?.data?.error ||
            t('auth.sendOtpFailed')
          : t('auth.sendOtpFailed');
      setError(errorMessage);
    } finally {
      setIsEmailOtpSending(false);
    }
  };

  const handleResendEmailOtp = async () => {
    setError('');
    setIsEmailOtpResending(true);

    try {
      const response = await api.post('/auth/login/email-otp/resend', { email });
      const expiresInSeconds = Number(response.data.expiresInSeconds) || emailOtpExpirySeconds;
      setEmailOtpChallengeId(response.data.challengeId || emailOtpChallengeId);
      setEmailOtpMaskedEmail(response.data.maskedEmail || emailOtpMaskedEmail);
      setEmailOtpLength(Math.min(10, Math.max(4, Number(response.data.otpLength) || emailOtpLength)));
      setEmailOtpExpirySeconds(expiresInSeconds);
      setOtpResendNow(Date.now());
      setEmailOtpExpiresAt(Date.now() + expiresInSeconds * 1000);
      setEmailOtpResendAvailableAt(Date.now() + emailOtpResendCooldownSeconds * 1000);
      setEmailOtp('');
    } catch (err: unknown) {
      const errorMessage =
        err && typeof err === 'object' && 'response' in err
          ? (err as { response?: { data?: { error?: string } } }).response?.data?.error ||
            t('auth.resendOtpFailed')
          : t('auth.resendOtpFailed');
      setError(errorMessage);
    } finally {
      setIsEmailOtpResending(false);
    }
  };

  const handleVerifyEmailOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setIsEmailOtpVerifying(true);

    try {
      const response = await api.post('/auth/login/email-otp/verify', {
        challengeId: emailOtpChallengeId,
        email,
        otp: emailOtp,
      });
      const { token, user } = response.data as { token: string; user: AuthResponseUser };
      completeAuth(token, user, true);
    } catch (err: unknown) {
      const errorMessage =
        err && typeof err === 'object' && 'response' in err
          ? (err as { response?: { data?: { error?: string } } }).response?.data?.error ||
            t('auth.verifyOtpFailed')
          : t('auth.verifyOtpFailed');
      setError(errorMessage);
    } finally {
      setIsEmailOtpVerifying(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[10000] flex flex-col md:items-center md:justify-center overflow-y-auto bg-white md:bg-black/60 p-0 md:p-4 md:backdrop-blur-sm">
      <Script
        src="https://accounts.google.com/gsi/client"
        strategy="afterInteractive"
        onLoad={() => setIsGoogleScriptReady(true)}
      />
      <div className="flex min-h-full md:min-h-0 w-full flex-col md:flex-row md:items-center md:justify-center">
        <div className="w-full flex-1 md:flex-none md:max-w-md min-h-full md:min-h-0 md:max-h-[calc(100dvh-1.5rem)] flex flex-col overflow-y-auto bg-white rounded-none md:rounded-xl shadow-none md:shadow-2xl animate-in fade-in md:zoom-in duration-200 [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden">
          <div className="relative flex min-h-[52px] sm:min-h-[56px] shrink-0 items-center justify-center bg-[#1A1A1A] px-4 sm:px-6 py-2.5 sm:py-3">
            <div className="flex items-center justify-center w-full">
              <Image src="/frontloginlogo.png" alt="JCB Exchange" width={260} height={70} priority className="h-9 sm:h-10 w-auto max-w-[185px] sm:max-w-[215px] object-contain" />
            </div>
              <button
              onClick={() => {
                resetOtpState();
                setAuthModalOpen(false);
              }}
              className="absolute top-1/2 -translate-y-1/2 right-3 sm:right-4 text-gray-400 transition-colors hover:text-white flex items-center justify-center p-1.5 rounded-full hover:bg-white/10"
              aria-label="Close"
            >
              <X size={20} />
            </button>
          </div>

          <div className="flex flex-1 flex-col justify-center p-5 sm:p-6 md:p-6 my-auto">
            <div className="mb-4 -mt-2 md:mt-0 text-center">
              <h4 className="text-2xl font-bold text-gray-900">
                {isPasswordReset ? 'Reset your password' : isLogin ? t('auth.welcomeBack') : t('auth.createAccount')}
              </h4>
            </div>

            {error ? (
              <div className="mb-4 rounded-md border border-red-100 bg-red-50 p-3 text-center text-sm font-semibold text-red-600">
                {error}
              </div>
            ) : null}

          <form
            onSubmit={
              isPasswordReset
                ? passwordResetStep === 'mobile'
                  ? handleSendPasswordResetOtp
                  : passwordResetStep === 'otp'
                    ? handleVerifyPasswordResetOtp
                    : handleResetPassword
                : isLogin && activeLoginMethod === 'mobileOtp'
                ? (otpChallengeId ? handleVerifyOtp : handleSendOtp)
                : isLogin && activeLoginMethod === 'emailOtp'
                  ? (emailOtpChallengeId ? handleVerifyEmailOtp : handleSendEmailOtp)
                  : handleSubmit
            }
            className="space-y-3"
          >
            {!isPasswordReset ? (
              <>
              {!isLogin ? (
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">{t('auth.fullName')}</label>
                <div className="relative">
                  <input
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className="block w-full rounded-md border border-gray-300 px-4 py-2 pl-10 text-sm outline-none focus:border-jcb-yellow focus:ring-jcb-yellow"
                    placeholder={t('auth.fullName')}
                    required={!isLogin}
                  />
                  <User className="absolute left-3 top-2.5 text-gray-400" size={18} />
                </div>
              </div>
            ) : null}

            {isLogin && activeLoginMethod === 'mobileOtp' ? (
              <>
                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-700">{t('auth.mobileNumber')}</label>
                  <div className="relative">
                    <input
                      type="tel"
                      value={mobile}
                      onChange={(e) => {
                        const nextMobile = e.target.value.replace(/\D/g, '').slice(0, 10);
                        setMobile(nextMobile);
                        setOtpChallengeId('');
                        setOtpMaskedMobile('');
                        setOtp('');
                        setOtpExpiresAt(0);
                        setOtpResendAvailableAt(0);
                        setOtpRequestMessage('');
                      }}
                      className="block w-full rounded-md border border-gray-300 px-4 py-2 pl-10 text-sm outline-none focus:border-jcb-yellow focus:ring-jcb-yellow"
                      placeholder={t('auth.mobileNumber')}
                      required
                    />
                    <Smartphone className="absolute left-3 top-2.5 text-gray-400" size={18} />
                  </div>
                </div>

                {otpRequestMessage ? (
                  <p className="rounded-md border border-blue-100 bg-blue-50 p-3 text-center text-xs font-medium text-blue-700">
                    {otpRequestMessage}
                  </p>
                ) : null}

                {otpChallengeId ? (
                  <div>
                    <label className="mb-1 block text-sm font-medium text-gray-700">{t('auth.otp')}</label>
                    <div className="relative">
                      <input
                        type="text"
                        value={otp}
                        onChange={(e) => setOtp(e.target.value.replace(/\D/g, '').slice(0, otpLength))}
                        inputMode="numeric"
                        autoComplete="one-time-code"
                        maxLength={otpLength}
                        className="block w-full rounded-md border border-gray-300 px-4 py-2 text-sm outline-none focus:border-jcb-yellow focus:ring-jcb-yellow"
                        placeholder={t('auth.otp')}
                        required
                      />
                    </div>
                    <p className="mt-2 text-xs text-gray-500">
                      {t('auth.otpSentTo', { mobile: otpMaskedMobile || t('auth.mobileNumber').toLowerCase() })}
                    </p>
                    <div className="mt-2 flex items-center justify-between gap-3 text-xs">
                      <span className="text-gray-500">
                      {t('auth.otpExpiresIn', { seconds: otpSecondsRemaining })}
                      </span>
                      <button
                        type="button"
                        onClick={() => void handleResendOtp()}
                        disabled={isOtpResending || otpResendSecondsRemaining > 0}
                        className="font-semibold text-jcb-dark hover:underline disabled:cursor-not-allowed disabled:text-gray-400 disabled:no-underline"
                      >
                        {isOtpResending
                          ? t('auth.resendingOtp')
                          : otpResendSecondsRemaining > 0
                            ? t('auth.resendOtpIn', { seconds: otpResendSecondsRemaining })
                            : t('auth.resendOtp')}
                      </button>
                    </div>
                  </div>
                ) : null}
              </>
            ) : (
              <>
                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-700">{t('auth.emailAddress')}</label>
                  <div className="relative">
                    <input
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      autoComplete={isLogin ? 'username' : 'email'}
                      className="block w-full rounded-md border border-gray-300 px-4 py-2 pl-10 text-sm outline-none focus:border-jcb-yellow focus:ring-jcb-yellow"
                      placeholder="you@example.com"
                      required
                    />
                    <Mail className="absolute left-3 top-2.5 text-gray-400" size={18} />
                  </div>
                </div>

                {!isLogin ? (
                  <div>
                  <label className="mb-1 block text-sm font-medium text-gray-700">{t('auth.mobileNumber')}</label>
                    <div className="relative">
                      <input
                        type="tel"
                        value={mobile}
                        onChange={(e) => setMobile(e.target.value.replace(/\D/g, '').slice(0, 10))}
                        className="block w-full rounded-md border border-gray-300 px-4 py-2 pl-10 text-sm outline-none focus:border-jcb-yellow focus:ring-jcb-yellow"
                        placeholder={t('auth.mobileNumber')}
                        required
                      />
                      <Smartphone className="absolute left-3 top-2.5 text-gray-400" size={18} />
                    </div>
                  </div>
                ) : null}

                {!isLogin ? (
                  <div className="space-y-2">
                    <label className="flex items-center gap-2 text-sm text-gray-700">
                      <input
                        type="checkbox"
                        checked={whatsappSameAsMobile}
                        onChange={(event) => setWhatsappSameAsMobile(event.target.checked)}
                        className="h-4 w-4 rounded border-gray-300 text-jcb-yellow focus:ring-jcb-yellow"
                      />
                      <span>{t('auth.whatsappSameAsMobile', 'This mobile number is also my WhatsApp number')}</span>
                    </label>
                    {!whatsappSameAsMobile ? (
                      <div className="relative">
                        <input
                          type="tel"
                          value={whatsappNumber}
                          onChange={(e) => setWhatsappNumber(e.target.value.replace(/\D/g, '').slice(0, 10))}
                          className="block w-full rounded-md border border-gray-300 px-4 py-2 pl-10 text-sm outline-none focus:border-jcb-yellow focus:ring-jcb-yellow"
                          placeholder={t('auth.whatsappNumber', 'WhatsApp Number')}
                          required
                        />
                        <Smartphone className="absolute left-3 top-2.5 text-gray-400" size={18} />
                      </div>
                    ) : null}
                  </div>
                ) : null}

                {isLogin && activeLoginMethod === 'emailOtp' ? (
                  emailOtpChallengeId ? (
                    <div>
                      <label className="mb-1 block text-sm font-medium text-gray-700">{t('auth.otp')}</label>
                      <input
                        type="text"
                        value={emailOtp}
                        onChange={(e) => setEmailOtp(e.target.value.replace(/\D/g, '').slice(0, emailOtpLength))}
                        inputMode="numeric"
                        autoComplete="one-time-code"
                        maxLength={emailOtpLength}
                        className="block w-full rounded-md border border-gray-300 px-4 py-2 text-sm outline-none focus:border-jcb-yellow focus:ring-jcb-yellow"
                        placeholder={t('auth.otp')}
                        required
                      />
                      <p className="mt-2 text-xs text-gray-500">
                        {t('auth.emailOtpSentTo', 'Email OTP sent to {email}', {
                          email: emailOtpMaskedEmail || email.toLowerCase(),
                        })}
                      </p>
                      <div className="mt-2 flex items-center justify-between gap-3 text-xs">
                        <span className="text-gray-500">
                          {t('auth.otpExpiresIn', { seconds: emailOtpSecondsRemaining })}
                        </span>
                        <button
                          type="button"
                          onClick={() => void handleResendEmailOtp()}
                          disabled={isEmailOtpResending || emailOtpResendSecondsRemaining > 0}
                          className="font-semibold text-jcb-dark hover:underline disabled:cursor-not-allowed disabled:text-gray-400 disabled:no-underline"
                        >
                          {isEmailOtpResending
                            ? t('auth.resendingOtp')
                            : emailOtpResendSecondsRemaining > 0
                              ? t('auth.resendOtpIn', { seconds: emailOtpResendSecondsRemaining })
                              : t('auth.resendOtp')}
                        </button>
                      </div>
                    </div>
                  ) : null
                ) : (
                  <div>
                    <label className="mb-1 block text-sm font-medium text-gray-700">{t('auth.password')}</label>
                    <div className="relative">
                      <input
                        type={showPassword ? 'text' : 'password'}
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        autoComplete={isLogin ? 'current-password' : 'new-password'}
                        className="block w-full rounded-md border border-gray-300 px-4 py-2 pl-10 pr-10 text-sm outline-none focus:border-jcb-yellow focus:ring-jcb-yellow"
                        placeholder="********"
                        required
                      />
                      <Lock className="absolute left-3 top-2.5 text-gray-400" size={18} />
                      <button
                        type="button"
                        onClick={() => setShowPassword(!showPassword)}
                        className="absolute right-3 top-2.5 text-gray-400 hover:text-gray-600 focus:outline-none"
                      >
                        {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                      </button>
                    </div>
                    {isLogin && activeLoginMethod === 'password' ? (
                      <button
                        type="button"
                        onClick={() => {
                          setIsPasswordReset(true);
                          setPasswordResetStep('mobile');
                          setPasswordResetMobile('');
                          setPasswordResetRequestMessage('');
                          setPasswordResetOtp('');
                          setPasswordResetChallengeId('');
                          setPasswordResetMaskedMobile('');
                          setPasswordResetOtpExpiresAt(0);
                          setPasswordResetResendAvailableAt(0);
                          setPasswordResetToken('');
                          setPasswordResetNewPassword('');
                          setPasswordResetConfirmPassword('');
                          setPassword('');
                          setShowPassword(false);
                          setError('');
                          setLoginMethod('password');
                        }}
                        className="mt-2 text-xs font-semibold text-jcb-dark hover:underline"
                      >
                        Forgot password?
                      </button>
                    ) : null}
                  </div>
                )}
              </>
              )}
              </>
            ) : (
              <>
                {passwordResetStep === 'mobile' ? (
                  <>
                    <p className="mb-1 text-center text-sm text-gray-500">
                      Enter your registered mobile number to receive an SMS OTP.
                    </p>
                    <div>
                      <label className="mb-1 block text-sm font-medium text-gray-700">Mobile number</label>
                      <div className="relative">
                        <input
                          type="tel"
                          value={passwordResetMobile}
                          onChange={(e) => {
                            setPasswordResetMobile(e.target.value.replace(/\D/g, '').slice(0, 10));
                            setPasswordResetRequestMessage('');
                            setError('');
                          }}
                          inputMode="numeric"
                          autoComplete="tel"
                          className="block w-full rounded-md border border-gray-300 px-4 py-2 pl-10 text-sm outline-none focus:border-jcb-yellow focus:ring-jcb-yellow"
                          placeholder="10-digit mobile number"
                          required
                        />
                        <Smartphone className="absolute left-3 top-2.5 text-gray-400" size={18} />
                      </div>
                    </div>
                    <p className="rounded-md border border-blue-100 bg-blue-50 p-3 text-center text-xs font-medium text-blue-700">
                      {passwordResetRequestMessage || 'If this number is registered, an OTP will be sent by SMS.'}
                    </p>
                  </>
                ) : passwordResetStep === 'otp' ? (
                  <>
                    <div>
                      <label className="mb-1 block text-sm font-medium text-gray-700">SMS OTP</label>
                      <input
                        type="text"
                        value={passwordResetOtp}
                        onChange={(e) => setPasswordResetOtp(e.target.value.replace(/\D/g, '').slice(0, otpLength))}
                        inputMode="numeric"
                        autoComplete="one-time-code"
                        maxLength={otpLength}
                        className="block w-full rounded-md border border-gray-300 px-4 py-2 text-sm outline-none focus:border-jcb-yellow focus:ring-jcb-yellow"
                        placeholder={`${otpLength}-digit OTP`}
                        required
                      />
                      <p className="mt-2 text-xs text-gray-500">
                        OTP sent to {passwordResetMaskedMobile || 'your registered mobile number'}.
                      </p>
                      <div className="mt-2 flex items-center justify-between gap-3 text-xs">
                        <span className="text-gray-500">
                          {t('auth.otpExpiresIn', { seconds: passwordResetOtpSecondsRemaining })}
                        </span>
                        <button
                          type="button"
                          onClick={() => void handleResendPasswordResetOtp()}
                          disabled={isPasswordResetResending || passwordResetResendSecondsRemaining > 0}
                          className="font-semibold text-jcb-dark hover:underline disabled:cursor-not-allowed disabled:text-gray-400 disabled:no-underline"
                        >
                          {isPasswordResetResending
                            ? t('auth.resendingOtp')
                            : passwordResetResendSecondsRemaining > 0
                              ? t('auth.resendOtpIn', { seconds: passwordResetResendSecondsRemaining })
                              : t('auth.resendOtp')}
                        </button>
                      </div>
                    </div>
                  </>
                ) : (
                  <>
                    <p className="mb-1 text-center text-sm text-gray-500">
                      Set a new password for your account.
                    </p>
                    <div>
                      <label className="mb-1 block text-sm font-medium text-gray-700">New password</label>
                      <div className="relative">
                        <input
                          type={showPassword ? 'text' : 'password'}
                          value={passwordResetNewPassword}
                          onChange={(e) => setPasswordResetNewPassword(e.target.value)}
                          autoComplete="new-password"
                          className="block w-full rounded-md border border-gray-300 px-4 py-2 pl-10 pr-10 text-sm outline-none focus:border-jcb-yellow focus:ring-jcb-yellow"
                          placeholder="Minimum 8 characters"
                          required
                        />
                        <Lock className="absolute left-3 top-2.5 text-gray-400" size={18} />
                        <button
                          type="button"
                          onClick={() => setShowPassword(!showPassword)}
                          className="absolute right-3 top-2.5 text-gray-400 hover:text-gray-600 focus:outline-none"
                          aria-label={showPassword ? 'Hide new password' : 'Show new password'}
                        >
                          {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                        </button>
                      </div>
                    </div>
                    <div>
                      <label className="mb-1 block text-sm font-medium text-gray-700">Confirm new password</label>
                      <div className="relative">
                        <input
                          type={showPassword ? 'text' : 'password'}
                          value={passwordResetConfirmPassword}
                          onChange={(e) => setPasswordResetConfirmPassword(e.target.value)}
                          autoComplete="new-password"
                          className="block w-full rounded-md border border-gray-300 px-4 py-2 pl-10 text-sm outline-none focus:border-jcb-yellow focus:ring-jcb-yellow"
                          placeholder="Re-enter new password"
                          required
                        />
                        <Lock className="absolute left-3 top-2.5 text-gray-400" size={18} />
                      </div>
                    </div>
                  </>
                )}
              </>
            )}



            <div className="pt-2 space-y-3">
              <button
                type="submit"
                disabled={isSubmitting || isOtpSending || isOtpVerifying || isOtpResending || isEmailOtpSending || isEmailOtpVerifying || isEmailOtpResending || isPasswordResetSending || isPasswordResetVerifying || isPasswordResetResending || isPasswordResetSaving}
                className="flex w-full justify-center rounded-md border border-transparent bg-jcb-yellow px-4 py-2.5 text-sm font-bold text-jcb-dark shadow-sm transition-colors hover:bg-yellow-400 focus:outline-none focus:ring-2 focus:ring-jcb-yellow focus:ring-offset-2 disabled:opacity-50"
              >
                {isPasswordReset
                  ? passwordResetStep === 'mobile'
                    ? isPasswordResetSending
                      ? 'Sending OTP...'
                      : 'Send OTP'
                    : passwordResetStep === 'otp'
                      ? isPasswordResetVerifying
                        ? 'Verifying OTP...'
                        : 'Verify OTP'
                      : isPasswordResetSaving
                        ? 'Updating password...'
                        : 'Update password'
                  : isLogin && activeLoginMethod === 'mobileOtp'
                  ? otpChallengeId
                    ? isOtpVerifying
                      ? `${t('auth.verifyOtpAndLogin')}...`
                      : t('auth.verifyOtpAndLogin')
                    : isOtpSending
                      ? t('auth.sendingOtp')
                      : t('auth.sendOtp')
                  : isLogin && activeLoginMethod === 'emailOtp'
                    ? emailOtpChallengeId
                      ? isEmailOtpVerifying
                        ? `${t('auth.verifyOtpAndLogin')}...`
                        : t('auth.verifyOtpAndLogin')
                      : isEmailOtpSending
                        ? t('auth.sendingOtp')
                        : t('auth.sendOtp')
                  : isSubmitting
                    ? t('auth.pleaseWait')
                    : isLogin
                      ? t('auth.loginToAccount')
                      : t('auth.createAccount')}
              </button>

              {isPasswordReset && passwordResetStep === 'otp' && passwordResetChallengeId ? (
                <button
                  type="button"
                  onClick={() => {
                    setPasswordResetStep('mobile');
                    setPasswordResetChallengeId('');
                    setPasswordResetOtp('');
                    setPasswordResetOtpExpiresAt(0);
                    setPasswordResetResendAvailableAt(0);
                    setError('');
                  }}
                  className="w-full text-sm font-semibold text-jcb-dark hover:underline"
                >
                  Change mobile number
                </button>
              ) : null}

              {!isPasswordReset && isLogin && activeLoginMethod === 'mobileOtp' && otpChallengeId ? (
                <button
                  type="button"
                  onClick={() => {
                    setOtpChallengeId('');
                    setOtpMaskedMobile('');
                    setOtpRequestMessage('');
                    setOtp('');
                    setOtpExpiresAt(0);
                    setOtpResendAvailableAt(0);
                    setError('');
                  }}
                  className="w-full text-sm font-semibold text-jcb-dark hover:underline"
                >
                  {t('auth.changeMobileNumber')}
                </button>
              ) : null}

              {!isPasswordReset && isLogin && activeLoginMethod === 'emailOtp' && emailOtpChallengeId ? (
                <button
                  type="button"
                  onClick={() => {
                    setEmailOtpChallengeId('');
                    setEmailOtpMaskedEmail('');
                    setEmailOtp('');
                    setEmailOtpExpiresAt(0);
                    setEmailOtpResendAvailableAt(0);
                    setError('');
                  }}
                  className="w-full text-sm font-semibold text-jcb-dark hover:underline"
                >
                  {t('auth.changeEmailAddress', 'Change email address')}
                </button>
              ) : null}

              {!isPasswordReset && isLogin && isMobileOtpEnabled ? (
                <button
                  type="button"
                  onClick={() => {
                    setLoginMethod(loginMethod === 'mobileOtp' ? 'password' : 'mobileOtp');
                    setError('');
                    if (loginMethod === 'mobileOtp') {
                      setOtpChallengeId('');
                      setOtpMaskedMobile('');
                      setOtpRequestMessage('');
                      setOtp('');
                      setOtpExpiresAt(0);
                      setOtpResendAvailableAt(0);
                    }
                  }}
                  className="flex w-full justify-center rounded-md border border-gray-300 bg-white px-4 py-2.5 text-sm font-bold text-gray-700 shadow-sm transition-colors hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-gray-200"
                >
                  {loginMethod === 'mobileOtp'
                    ? t('auth.loginWithPassword')
                    : t('auth.loginWithMobileOtp', 'Login with Mobile OTP')}
                </button>
              ) : null}

              {!isPasswordReset && isLogin && isEmailOtpEnabled ? (
                <button
                  type="button"
                  onClick={() => {
                    setLoginMethod(loginMethod === 'emailOtp' ? 'password' : 'emailOtp');
                    setError('');
                    if (loginMethod === 'emailOtp') {
                      setEmailOtpChallengeId('');
                      setEmailOtpMaskedEmail('');
                      setEmailOtp('');
                      setEmailOtpExpiresAt(0);
                      setEmailOtpResendAvailableAt(0);
                    }
                  }}
                  className="flex w-full justify-center rounded-md border border-gray-300 bg-white px-4 py-2.5 text-sm font-bold text-gray-700 shadow-sm transition-colors hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-gray-200"
                >
                  {loginMethod === 'emailOtp'
                    ? t('auth.loginWithPassword')
                    : t('auth.loginWithEmailOtp', 'Login with Email OTP')}
                </button>
              ) : null}
            </div>
          </form>

          {!isPasswordReset && canRenderGoogleLogin ? (
            <>
              <div className="relative my-4">
                <div className="absolute inset-0 flex items-center">
                  <div className="w-full border-t border-gray-300" />
                </div>
                <div className="relative flex justify-center text-sm">
                  <span className="bg-white px-2 text-gray-500">{t('auth.orContinueWithGoogle')}</span>
                </div>
              </div>

              <div className="mb-6">
                <div className="space-y-2">
                  <div ref={googleButtonRef} className="flex min-h-[44px] items-center justify-center" />
                  {!isGoogleScriptReady ? (
                    <p className="text-center text-xs text-gray-500">{t('auth.loadingGoogleLogin')}</p>
                  ) : null}
                </div>
              </div>
            </>
          ) : null}

          <div className="mt-4 text-center text-sm text-gray-600">
            {isPasswordReset ? (
              <>
                Remembered your password?{' '}
                <button
                  type="button"
                  onClick={() => {
                    resetOtpState();
                    setError('');
                  }}
                  className="font-bold text-jcb-dark hover:underline focus:outline-none"
                >
                  Back to login
                </button>
              </>
            ) : (
              <>
                {isLogin ? `${t('auth.dontHaveAccount')} ` : `${t('auth.alreadyHaveAccount')} `}
                <button
                  type="button"
                  onClick={() => setAuthModalOpen(true, isLogin ? 'signup' : 'login')}
                  className="font-bold text-jcb-dark hover:underline focus:outline-none"
                >
                  {isLogin ? t('auth.signUp') : t('auth.logIn')}
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
    </div>
  );
}
