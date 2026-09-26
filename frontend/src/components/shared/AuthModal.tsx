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
  role?: string;
};

type MobileOtpConfigResponse = {
  enabled: boolean;
  otpLength?: number;
  otpExpirySeconds?: number;
  resendCooldownSeconds?: number;
};

type EmailOtpConfigResponse = MobileOtpConfigResponse;

export default function AuthModal() {
  const { t } = useTranslation();
  const { isAuthModalOpen, setAuthModalOpen, setAuth } = useAuthStore();
  const showToast = useToastStore((state) => state.showToast);
  const [isLogin, setIsLogin] = useState(true);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [mobile, setMobile] = useState('');
  const [otp, setOtp] = useState('');
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

  const completeAuth = useCallback((token: string, user: AuthResponseUser, shouldNotify = true) => {
    setAuth(token, user);
    setAuthModalOpen(false);
    if (shouldNotify) {
      showLoginSuccessToast(user.name, user.email, user.mobile);
    }
  }, [setAuth, setAuthModalOpen, showLoginSuccessToast]);

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
    if (!otpChallengeId && !emailOtpChallengeId) {
      return;
    }

    const timer = window.setInterval(() => setOtpResendNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [otpChallengeId, emailOtpChallengeId]);

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

        const response = await api.post('/auth/register', { email, password, name, mobile });
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

  const handleSendOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setIsOtpSending(true);

    try {
      if (mobile.replace(/\D/g, '').length !== 10) {
        setError(t('auth.validMobile'));
        setIsOtpSending(false);
        return;
      }

      const response = await api.post('/auth/login/mobile-otp/send', { mobile });
      setOtpChallengeId(response.data.challengeId || '');
      setOtpMaskedMobile(response.data.maskedMobile || '');
      setOtpLength(Math.min(10, Math.max(4, Number(response.data.otpLength) || otpLength)));
      setOtpExpirySeconds(Number(response.data.expiresInSeconds) || otpExpirySeconds);
      setOtpResendNow(Date.now());
      setOtpExpiresAt(Date.now() + (Number(response.data.expiresInSeconds) || otpExpirySeconds) * 1000);
      setOtpResendAvailableAt(Date.now() + otpResendCooldownSeconds * 1000);
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
    setIsOtpResending(true);

    try {
      const response = await api.post('/auth/login/mobile-otp/resend', { mobile });
      setOtpChallengeId(response.data.challengeId || otpChallengeId);
      setOtpMaskedMobile(response.data.maskedMobile || otpMaskedMobile);
      setOtpLength(Math.min(10, Math.max(4, Number(response.data.otpLength) || otpLength)));
      setOtpExpirySeconds(Number(response.data.expiresInSeconds) || otpExpirySeconds);
      setOtpResendNow(Date.now());
      setOtpExpiresAt(Date.now() + (Number(response.data.expiresInSeconds) || otpExpirySeconds) * 1000);
      setOtpResendAvailableAt(Date.now() + otpResendCooldownSeconds * 1000);
      setOtp('');
    } catch (err: unknown) {
      const errorMessage =
        err && typeof err === 'object' && 'response' in err
          ? (err as { response?: { data?: { error?: string } } }).response?.data?.error ||
            t('auth.resendOtpFailed')
          : t('auth.resendOtpFailed');
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
    <div className="fixed inset-0 z-[10000] overflow-y-auto bg-white md:bg-black/60 md:p-4 md:backdrop-blur-sm">
      <Script
        src="https://accounts.google.com/gsi/client"
        strategy="afterInteractive"
        onLoad={() => setIsGoogleScriptReady(true)}
      />
      <div className="flex min-h-full items-start md:items-center justify-center">
        <div className="w-full min-h-screen md:min-h-0 md:h-auto md:max-w-md overflow-hidden md:rounded-xl bg-white md:shadow-2xl animate-in slide-in-from-bottom-4 md:zoom-in duration-200">
          <div className="relative flex items-center justify-center bg-transparent md:bg-[#1A1A1A] px-6 py-2 md:py-4 min-h-[48px] md:min-h-[64px]">
            <div className="flex items-center justify-center w-full">
              <Image src="/frontloginlogo.png" alt="JCB Exchange" width={300} height={80} priority className="h-auto w-full max-w-[240px] object-contain" />
            </div>
            <button
              onClick={() => setAuthModalOpen(false)}
              className="absolute top-3 right-3 md:top-1/2 md:-translate-y-1/2 md:right-6 text-gray-600 md:text-gray-400 transition-colors hover:text-gray-900 md:hover:text-white"
            >
              <X size={24} />
            </button>
          </div>

          <div className="p-5 pt-0 md:pt-6 sm:p-6 flex flex-col">
            <div className="mb-4 -mt-2 md:mt-0 text-center">
              <h4 className="text-2xl font-bold text-gray-900">
                {isLogin ? t('auth.welcomeBack') : t('auth.createAccount')}
              </h4>
            </div>

            {error ? (
              <div className="mb-4 rounded-md border border-red-100 bg-red-50 p-3 text-center text-sm font-semibold text-red-600">
                {error}
              </div>
            ) : null}

          <form
            onSubmit={
              isLogin && activeLoginMethod === 'mobileOtp'
                ? (otpChallengeId ? handleVerifyOtp : handleSendOtp)
                : isLogin && activeLoginMethod === 'emailOtp'
                  ? (emailOtpChallengeId ? handleVerifyEmailOtp : handleSendEmailOtp)
                  : handleSubmit
            }
            className="space-y-3"
          >
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
                      onChange={(e) => setMobile(e.target.value.replace(/\D/g, '').slice(0, 10))}
                      className="block w-full rounded-md border border-gray-300 px-4 py-2 pl-10 text-sm outline-none focus:border-jcb-yellow focus:ring-jcb-yellow"
                      placeholder={t('auth.mobileNumber')}
                      required
                    />
                    <Smartphone className="absolute left-3 top-2.5 text-gray-400" size={18} />
                  </div>
                </div>

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
                  </div>
                )}
              </>
            )}



            <div className="pt-2 space-y-3">
              <button
                type="submit"
                disabled={isSubmitting || isOtpSending || isOtpVerifying || isOtpResending || isEmailOtpSending || isEmailOtpVerifying || isEmailOtpResending}
                className="flex w-full justify-center rounded-md border border-transparent bg-jcb-yellow px-4 py-2.5 text-sm font-bold text-jcb-dark shadow-sm transition-colors hover:bg-yellow-400 focus:outline-none focus:ring-2 focus:ring-jcb-yellow focus:ring-offset-2 disabled:opacity-50"
              >
                {isLogin && activeLoginMethod === 'mobileOtp'
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

              {isLogin && activeLoginMethod === 'mobileOtp' && otpChallengeId ? (
                <button
                  type="button"
                  onClick={() => {
                    setOtpChallengeId('');
                    setOtpMaskedMobile('');
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

              {isLogin && activeLoginMethod === 'emailOtp' && emailOtpChallengeId ? (
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

              {isLogin && isMobileOtpEnabled ? (
                <button
                  type="button"
                  onClick={() => {
                    setLoginMethod(loginMethod === 'mobileOtp' ? 'password' : 'mobileOtp');
                    setError('');
                    if (loginMethod === 'mobileOtp') {
                      setOtpChallengeId('');
                      setOtpMaskedMobile('');
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

              {isLogin && isEmailOtpEnabled ? (
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

          {canRenderGoogleLogin ? (
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
            {isLogin ? `${t('auth.dontHaveAccount')} ` : `${t('auth.alreadyHaveAccount')} `}
            <button
              type="button"
              onClick={() => setIsLogin(!isLogin)}
              className="font-bold text-jcb-dark hover:underline focus:outline-none"
            >
              {isLogin ? t('auth.signUp') : t('auth.logIn')}
            </button>
          </div>
        </div>
      </div>
    </div>
    </div>
  );
}
