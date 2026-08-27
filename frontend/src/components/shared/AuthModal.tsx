"use client";

import React, { useCallback, useEffect, useRef, useState } from 'react';
import Script from 'next/script';
import { useAuthStore } from '@/store/authStore';
import { X, Mail, Lock, User, Eye, EyeOff, Smartphone } from 'lucide-react';
import api from '@/lib/api';
import { useTranslation } from '@/hooks/useTranslation';

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
  role?: string;
};

type MobileOtpConfigResponse = {
  enabled: boolean;
};

export default function AuthModal() {
  const { t } = useTranslation();
  const { isAuthModalOpen, setAuthModalOpen, setAuth } = useAuthStore();
  const [isLogin, setIsLogin] = useState(true);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [mobile, setMobile] = useState('');
  const [otp, setOtp] = useState('');
  const [error, setError] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isOtpSending, setIsOtpSending] = useState(false);
  const [isOtpVerifying, setIsOtpVerifying] = useState(false);
  const [isMobileOtpEnabled, setIsMobileOtpEnabled] = useState(false);
  const [loginMethod, setLoginMethod] = useState<'password' | 'otp'>('password');
  const [otpChallengeId, setOtpChallengeId] = useState('');
  const [otpMaskedMobile, setOtpMaskedMobile] = useState('');
  const [googleClientId, setGoogleClientId] = useState<string | null>(null);
  const [isGoogleScriptReady, setIsGoogleScriptReady] = useState(
    typeof window !== 'undefined' && !!window.google
  );
  const googleButtonRef = useRef<HTMLDivElement | null>(null);
  const googleInitializedRef = useRef(false);

  const isGoogleConfigured =
    !!googleClientId && !googleClientId.startsWith('YOUR_');
  const canRenderGoogleLogin = isGoogleConfigured;

  const completeAuth = useCallback((token: string, user: AuthResponseUser) => {
    setAuth(token, user);
    setAuthModalOpen(false);
  }, [setAuth, setAuthModalOpen]);

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
      completeAuth(token, user);
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
        const [googleResponse, otpConfigResponse] = await Promise.all([
          api.get<{ enabled: boolean; clientId: string | null }>('/auth/google-config'),
          api.get<MobileOtpConfigResponse>('/auth/mobile-otp/config'),
        ]);

        if (!cancelled) {
          setGoogleClientId(googleResponse.data.enabled ? googleResponse.data.clientId : null);
          setIsMobileOtpEnabled(otpConfigResponse.data.enabled === true);
        }
      } catch {
        if (!cancelled) {
          setGoogleClientId(null);
          setIsMobileOtpEnabled(false);
        }
      }
    };

    void loadGoogleConfig();

    return () => {
      cancelled = true;
    };
  }, []);

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
        completeAuth(token, user);
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
      completeAuth(token, user);
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

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-black/60 p-4 backdrop-blur-sm">
      <Script
        src="https://accounts.google.com/gsi/client"
        strategy="afterInteractive"
        onLoad={() => setIsGoogleScriptReady(true)}
      />
      <div className="flex min-h-full items-center justify-center">
        <div className="w-full max-w-md overflow-hidden rounded-xl bg-white shadow-2xl animate-in fade-in zoom-in duration-200">
          <div className="flex items-center justify-between bg-[#1A1A1A] px-6 py-4">
            <h3 className="text-xl font-bold text-white">
              <span className="text-jcb-yellow italic">JCB</span>EXCHANGE
            </h3>
            <button
              onClick={() => setAuthModalOpen(false)}
              className="text-gray-400 transition-colors hover:text-white"
            >
              <X size={24} />
            </button>
          </div>

          <div className="p-5 sm:p-6">
            <div className="mb-3 text-center">
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
            onSubmit={isLogin && loginMethod === 'otp' ? (otpChallengeId ? handleVerifyOtp : handleSendOtp) : handleSubmit}
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

            {isLogin && isMobileOtpEnabled && loginMethod === 'otp' ? (
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
                        onChange={(e) => setOtp(e.target.value.replace(/\D/g, '').slice(0, 6))}
                        className="block w-full rounded-md border border-gray-300 px-4 py-2 text-sm outline-none focus:border-jcb-yellow focus:ring-jcb-yellow"
                        placeholder={t('auth.otp')}
                        required
                      />
                    </div>
                    <p className="mt-2 text-xs text-gray-500">
                      {t('auth.otpSentTo', { mobile: otpMaskedMobile || t('auth.mobileNumber').toLowerCase() })}
                    </p>
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
              </>
            )}



            <div className="pt-2 space-y-3">
              <button
                type="submit"
                disabled={isSubmitting || isOtpSending || isOtpVerifying}
                className="flex w-full justify-center rounded-md border border-transparent bg-jcb-yellow px-4 py-2.5 text-sm font-bold text-jcb-dark shadow-sm transition-colors hover:bg-yellow-400 focus:outline-none focus:ring-2 focus:ring-jcb-yellow focus:ring-offset-2 disabled:opacity-50"
              >
                {isLogin && loginMethod === 'otp'
                  ? otpChallengeId
                    ? isOtpVerifying
                      ? `${t('auth.verifyOtpAndLogin')}...`
                      : t('auth.verifyOtpAndLogin')
                    : isOtpSending
                      ? t('auth.sendingOtp')
                      : t('auth.sendOtp')
                  : isSubmitting
                    ? t('auth.pleaseWait')
                    : isLogin
                      ? t('auth.loginToAccount')
                      : t('auth.createAccount')}
              </button>

              {isLogin && loginMethod === 'otp' && otpChallengeId ? (
                <button
                  type="button"
                  onClick={() => {
                    setOtpChallengeId('');
                    setOtpMaskedMobile('');
                    setOtp('');
                    setError('');
                  }}
                  className="w-full text-sm font-semibold text-jcb-dark hover:underline"
                >
                  {t('auth.changeMobileNumber')}
                </button>
              ) : null}

              {isLogin && isMobileOtpEnabled ? (
                <button
                  type="button"
                  onClick={() => {
                    setLoginMethod(loginMethod === 'password' ? 'otp' : 'password');
                    setError('');
                    if (loginMethod === 'otp') {
                      setOtpChallengeId('');
                      setOtpMaskedMobile('');
                      setOtp('');
                    }
                  }}
                  className="flex w-full justify-center rounded-md border border-gray-300 bg-white px-4 py-2.5 text-sm font-bold text-gray-700 shadow-sm transition-colors hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-gray-200"
                >
                  {loginMethod === 'password' ? t('auth.loginWithOtp') : t('auth.loginWithPassword')}
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
