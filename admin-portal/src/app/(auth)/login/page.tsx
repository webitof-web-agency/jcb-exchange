"use client";
import React, { Suspense, useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import { Mail, Lock, Eye, EyeOff } from 'lucide-react';
import api from '@/lib/api';
import { useTranslation } from '@/hooks/useTranslation';
import { useAuthStore } from '@/store/authStore';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { ACCOUNT_INACTIVE_CODE, ACCOUNT_REVOKED_CODE } from '@/lib/sessionAccess';
import { getEmployeeLandingPath, resolveEmployeeRouteRedirect } from '@/lib/portalRoutes';
import PortalBrand from '@/components/layout/PortalBrand';

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

function LoginPageInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const setAuth = useAuthStore((state) => state.setAuth);
  const { t } = useTranslation();

  const [formData, setFormData] = useState({ email: '', password: '' });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [isFirstSetup, setIsFirstSetup] = useState(false);
  const [statusLoading, setStatusLoading] = useState(true);
  const [showPassword, setShowPassword] = useState(false);

  const redirectAfterLogin = useCallback((token: string, user: AuthenticatedPortalUser, nextRoute?: string | null) => {
    setAuth(token, user);

    if (user.role === 'SUPER_ADMIN') {
      router.push(nextRoute || '/superadmin/dashboard');
      return;
    }

    if (user.role === 'ADMIN') {
      router.push(nextRoute || '/admin/dashboard');
      return;
    }

    if (user.role === 'EMPLOYEE') {
      router.push(resolveEmployeeRouteRedirect(nextRoute || '', user.permissions) || getEmployeeLandingPath(user.permissions));
      return;
    }

    if (user.role === 'PARTNER') {
      if (
        user.accountStatus === 'ACTIVE' &&
        user.onboardingStatus === 'APPROVED' &&
        user.kycStatus === 'APPROVED'
      ) {
        router.push(nextRoute || '/partner/dashboard');
      } else {
        router.push('/partner/kyc');
      }
      return;
    }

    if (user.role === 'CUSTOMER') {
      router.push('/partner/kyc');
      return;
    }

    setError(t('authPortal.portalAccessOnly'));
  }, [router, setAuth, t]);

  useEffect(() => {
    const handoffToken = searchParams.get('token');
    const nextRoute = searchParams.get('next');

    if (!handoffToken) {
      return;
    }

    const consumePortalHandoff = async () => {
      try {
        const response = await api.get('/auth/profile', {
          headers: {
            Authorization: `Bearer ${handoffToken}`,
          },
        });

        const user = response.data.user;
        redirectAfterLogin(handoffToken, user, nextRoute);
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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const response = await api.post('/auth/login', formData);
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

  if (statusLoading) {
    return <div className="min-h-screen bg-[#1a1a1a] flex items-center justify-center text-white">{t('common.loading')}</div>;
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#1a1a1a] bg-opacity-60 bg-[url('/jcb-bg.jpg')] bg-cover bg-center bg-blend-overlay font-sans relative px-4">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-[480px] overflow-hidden flex flex-col">
        <div className="flex justify-center items-center px-6 py-5 bg-[#1A1A1A] border-b border-white/10">
          <div className="flex flex-col items-center justify-center gap-1.5 text-center">
            <PortalBrand href="/login" showSubtitle={false} />
            <span className={`px-2 py-0.5 text-[8px] sm:text-[9px] leading-none uppercase tracking-widest font-extrabold rounded-sm shadow-sm whitespace-nowrap ${isFirstSetup ? 'bg-red-500 text-white' : 'bg-[#FFC107] text-black'}`}>
              {isFirstSetup ? t('authPortal.superAdminBadge') : t('authPortal.portalBadge')}
            </span>
          </div>
        </div>

        <div className="p-8 sm:p-10">
          {isFirstSetup ? (
            <div className="text-center">
              <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <Lock className="h-8 w-8 text-red-600" />
              </div>
              <h1 className="text-2xl font-bold text-gray-900 mb-2">{t('authPortal.setupRequiredTitle')}</h1>
              <p className="text-gray-500 text-sm mb-8">
                {t('authPortal.setupRequiredDescription')}
              </p>

              <Link href="/signup">
                <button className="w-full font-bold py-3.5 rounded-lg transition-colors bg-red-600 hover:bg-red-700 text-white">
                  {t('authPortal.initializeSetup')}
                </button>
              </Link>

              <Link href="/register">
                <button className="w-full mt-3 font-semibold py-3 rounded-lg transition-colors border border-red-200 text-red-700 hover:bg-red-50">
                  {t('authPortal.openRegisterPage')}
                </button>
              </Link>

              <p className="mt-4 text-xs text-gray-500">
                {t('authPortal.firstTimeSetupHelp')}
              </p>
            </div>
          ) : (
            <>
              <div className="text-center mb-8">
                <h1 className="text-2xl font-bold text-gray-900 mb-2">
                  {t('authPortal.welcomeBack')}
                </h1>
                <p className="text-gray-500 text-sm">
                  {t('authPortal.loginDescription')}
                </p>
              </div>

              {error && (
                <div className="mb-4 p-3 bg-red-50 border border-red-100 text-red-600 text-sm font-semibold rounded-md text-center">
                  {error}
                </div>
              )}

              <form onSubmit={handleSubmit} className="space-y-5">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">{t('authPortal.emailAddress')}</label>
                    <div className="relative">
                      <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                        <Mail className="h-4 w-4 text-gray-400" />
                      </div>
                      <input
                        type="email"
                        required
                        value={formData.email}
                        onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                        className="block w-full pl-10 pr-3 py-3 border border-gray-200 rounded-lg bg-[#F5F8FA] text-gray-900 focus:outline-none focus:ring-2 focus:ring-[#FFC107] focus:border-transparent transition-all sm:text-sm"
                        placeholder={t('authPortal.enterEmailAddress')}
                        autoComplete="off"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">{t('authPortal.password')}</label>
                    <div className="relative">
                      <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                        <Lock className="h-4 w-4 text-gray-400" />
                      </div>
                      <input
                        type={showPassword ? 'text' : 'password'}
                        required
                        value={formData.password}
                        onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                        className="block w-full pl-10 pr-10 py-3 border border-gray-200 rounded-lg bg-[#F5F8FA] text-gray-900 focus:outline-none focus:ring-2 focus:ring-[#FFC107] focus:border-transparent transition-all sm:text-sm"
                        placeholder={t('authPortal.enterPassword')}
                        autoComplete="new-password"
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword(!showPassword)}
                        className="absolute inset-y-0 right-0 pr-3 flex items-center text-gray-500 hover:text-gray-700 focus:outline-none"
                      >
                        {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      </button>
                    </div>
                  </div>

                  <button
                    type="submit"
                    disabled={loading}
                    className="w-full font-bold py-3.5 rounded-lg transition-colors mt-2 bg-[#FFC107] hover:bg-[#E5AD06] text-black disabled:opacity-50"
                  >
                    {loading ? t('authPortal.authenticating') : t('authPortal.loginToAccount')}
                  </button>
                </form>

              <p className="text-center text-sm text-gray-500 mt-8">
                {t('authPortal.loginFooterHelp')}
              </p>

              <div className="mt-4 text-center">
                <Link href="/signup" className="text-sm font-semibold text-[#C28D00] hover:underline">
                  {t('authPortal.registerHere')}
                </Link>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function LoadingFallback() {
  const { t } = useTranslation();

  return (
    <div className="min-h-screen bg-[#1a1a1a] flex items-center justify-center text-white">
      {t('common.loading')}
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={<LoadingFallback />}>
      <LoginPageInner />
    </Suspense>
  );
}
