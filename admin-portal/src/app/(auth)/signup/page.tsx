"use client";
import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { Mail, Lock, User, Phone, BriefcaseBusiness, MessageCircle } from 'lucide-react';
import api from '@/lib/api';
import { useTranslation } from '@/hooks/useTranslation';
import BrandLoader from '@/components/ui/BrandLoader';
import { useAuthStore } from '@/store/authStore';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import PortalBrand from '@/components/layout/PortalBrand';

export default function SignupPage() {
  const router = useRouter();
  const setAuth = useAuthStore((state) => state.setAuth);
  const { t } = useTranslation();

  const [formData, setFormData] = useState({ name: '', email: '', mobile: '', password: '' });
  const [whatsappSameAsMobile, setWhatsappSameAsMobile] = useState(true);
  const [whatsappNumber, setWhatsappNumber] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [isFirstSetup, setIsFirstSetup] = useState(false);
  const [statusLoading, setStatusLoading] = useState(true);

  // Check if a Super Admin exists in the database
  useEffect(() => {
    const checkSetupStatus = async () => {
      try {
        const response = await api.get('/auth/setup-status');
        setIsFirstSetup(!response.data.hasSuperAdmin);
      } catch (err) {
        console.error("Failed to check setup status", err);
      } finally {
        setStatusLoading(false);
      }
    };
    checkSetupStatus();
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    // Phone Number Validation (10 digits)
    const cleanPhone = formData.mobile.replace(/\D/g, '').slice(-10);
    if (cleanPhone.length !== 10) {
      setError(t('authPortal.validMobile'));
      return;
    }

    const cleanWhatsappNumber = whatsappSameAsMobile
      ? cleanPhone
      : whatsappNumber.replace(/\D/g, '').slice(-10);
    if (cleanWhatsappNumber.length !== 10) {
      setError(t('authPortal.validWhatsappNumber', 'Please enter a valid 10-digit WhatsApp number.'));
      return;
    }

    setLoading(true);

    try {
      const response = await api.post('/auth/register', {
        ...formData,
        mobile: cleanPhone,
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

  if (statusLoading) {
    return <BrandLoader variant="fullscreen" size="lg" bg="dark" text={t('common.loading')} />;
  }

  const pageTitle = isFirstSetup ? t('authPortal.createSuperAdminAccount') : t('authPortal.startPartnerApplication');
  const pageSubtitle = isFirstSetup
    ? t('authPortal.firstTimeSetupCreatesAccount')
    : t('authPortal.createLoginThenOnboarding');
  const submitLabel = isFirstSetup ? t('authPortal.createSuperAdmin') : t('authPortal.createApplicationLogin');
  const badgeLabel = isFirstSetup ? t('authPortal.superAdminBadge') : t('authPortal.applicantBadge');

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#1a1a1a] bg-opacity-60 bg-[url('/jcb-bg.webp')] bg-cover bg-center bg-blend-overlay font-sans relative px-4 py-8">
      
      {/* Main Box */}
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-[480px] overflow-hidden flex flex-col">
        
        {/* Keep signup branding identical to the signin portal header. */}
        <div className="flex justify-center items-center px-6 py-4 bg-[#1A1A1A] border-b border-white/10">
          <div className="flex flex-col items-center justify-center gap-0.5 text-center">
            <PortalBrand href="/signup" showSubtitle={false} logoSrc="/Logo-white.webp" />
            <span className={`px-2 py-0.5 text-[8px] sm:text-[9px] leading-none uppercase tracking-widest font-extrabold rounded-sm shadow-sm whitespace-nowrap ${isFirstSetup ? 'bg-red-500 text-white' : 'bg-[#FFC107] text-black'}`}>
              {badgeLabel}
            </span>
          </div>
        </div>

        <div className="p-8 sm:p-10">
          <div className="text-center mb-8">
            <h1 className="text-2xl font-bold text-gray-900 mb-2">
              {pageTitle}
            </h1>
            <p className="text-gray-500 text-sm">
              {pageSubtitle}
            </p>
          </div>

          {error && (
            <div className="mb-4 p-3 bg-red-50 border border-red-100 text-red-600 text-sm font-semibold rounded-md text-center">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">


              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  {isFirstSetup ? t('authPortal.fullName') : t('authPortal.businessContactName')}
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                    {isFirstSetup ? <User className="h-4 w-4 text-gray-400" /> : <BriefcaseBusiness className="h-4 w-4 text-gray-400" />}
                  </div>
                  <input 
                    type="text" 
                    required
                    value={formData.name}
                    onChange={(e) => setFormData({...formData, name: e.target.value})}
                    className="block w-full pl-10 pr-3 py-3 border border-gray-200 rounded-lg bg-[#F5F8FA] text-gray-900 focus:outline-none focus:ring-2 focus:ring-[#FFC107] focus:border-transparent transition-all sm:text-sm" 
                    placeholder={isFirstSetup ? t('authPortal.enterFullName') : t('authPortal.enterBusinessContactName')} 
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">{t('authPortal.mobileNumber')}</label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                    <Phone className="h-4 w-4 text-gray-400" />
                  </div>
                  <input 
                    type="text" 
                    inputMode="numeric"
                    maxLength={10}
                    required
                    value={formData.mobile}
                    onChange={(e) => {
                      const onlyNums = e.target.value.replace(/[^0-9]/g, '');
                      setFormData({...formData, mobile: onlyNums});
                    }}
                    className="block w-full pl-10 pr-3 py-3 border border-gray-200 rounded-lg bg-[#F5F8FA] text-gray-900 focus:outline-none focus:ring-2 focus:ring-[#FFC107] focus:border-transparent transition-all sm:text-sm" 
                    placeholder={t('authPortal.enterMobileNumber')} 
                  />
                </div>
              </div>

              <div className="space-y-2">
                <label className="flex items-start gap-2 text-sm text-gray-700">
                  <input
                    id="whatsapp-same-as-mobile"
                    type="checkbox"
                    checked={whatsappSameAsMobile}
                    onChange={(event) => setWhatsappSameAsMobile(event.target.checked)}
                    className="mt-0.5 h-4 w-4 rounded border-gray-300 text-[#FFC107] focus:ring-[#FFC107]"
                  />
                  <span className="cursor-pointer">
                    {t('authPortal.whatsappSameAsMobile', 'This mobile number is also my WhatsApp number')}
                  </span>
                </label>

                {!whatsappSameAsMobile ? (
                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                      <MessageCircle className="h-4 w-4 text-gray-400" />
                    </div>
                    <input
                      type="tel"
                      inputMode="numeric"
                      maxLength={10}
                      required
                      value={whatsappNumber}
                      onChange={(event) => setWhatsappNumber(event.target.value.replace(/[^0-9]/g, ''))}
                      className="block w-full pl-10 pr-3 py-3 border border-gray-200 rounded-lg bg-[#F5F8FA] text-gray-900 focus:outline-none focus:ring-2 focus:ring-[#FFC107] focus:border-transparent transition-all sm:text-sm"
                      placeholder={t('authPortal.whatsappNumber', 'Enter WhatsApp number')}
                      autoComplete="tel"
                    />
                  </div>
                ) : (
                  <p className="pl-6 text-xs text-gray-500">
                    {formData.mobile
                      ? `WhatsApp number: ${formData.mobile}`
                      : 'WhatsApp number will use your mobile number.'}
                  </p>
                )}
              </div>

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
                    onChange={(e) => setFormData({...formData, email: e.target.value})}
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
                    type="password" 
                    required
                    value={formData.password}
                    onChange={(e) => setFormData({...formData, password: e.target.value})}
                    className="block w-full pl-10 pr-3 py-3 border border-gray-200 rounded-lg bg-[#F5F8FA] text-gray-900 focus:outline-none focus:ring-2 focus:ring-[#FFC107] focus:border-transparent transition-all sm:text-sm" 
                    placeholder={t('authPortal.enterPassword')} 
                    autoComplete="new-password"
                  />
                </div>
              </div>

              <button 
                type="submit" 
                disabled={loading}
                className="w-full font-bold py-3.5 rounded-lg transition-colors mt-4 bg-[#FFC107] hover:bg-[#E5AD06] text-black disabled:opacity-50"
              >
                {loading ? t('authPortal.creatingAccount') : submitLabel}
              </button>
          </form>

          <p className="text-center text-sm text-gray-500 mt-6">
            {t('authPortal.alreadyHaveAccount')} <Link href="/login" className="font-bold text-gray-900 hover:underline">{t('authPortal.logIn')}</Link>
          </p>
        </div>
      </div>
    </div>
  );
}
