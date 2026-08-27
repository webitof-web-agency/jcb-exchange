'use client';

import { useCallback, useEffect, useState } from 'react';
import type { AxiosError } from 'axios';
import { CreditCard, ImagePlus, KeyRound, Phone, Save, ShieldCheck } from 'lucide-react';
import { toast } from 'react-toastify';
import api from '@/lib/api';
import HomepageContentSettings from '@/components/admin/HomepageContentSettings';

type PrimePaymentRecord = {
  id: string;
  userId: string;
  status: 'PENDING' | 'ACTIVE' | 'REJECTED' | 'EXPIRED' | 'CANCELLED';
  transactionRef: string | null;
  paymentNote: string | null;
  receiptUrl: string | null;
  paidAmount: number;
  paidUpiId: string | null;
  submittedAt: string;
  approvedAt: string | null;
  rejectedAt: string | null;
  rejectionReason: string | null;
  expiresAt: string | null;
  user: {
    id: string;
    name?: string | null;
    email?: string | null;
    mobile?: string | null;
  } | null;
};

type SettingsResponse = {
  googleAuth: {
    enabled: boolean;
    clientId: string;
    updatedAt?: string | null;
    updatedByUserId?: string | null;
  };
  mobileOtp: {
    enabled: boolean;
    apiKey: string;
    senderId: string;
    templateId: string;
    templateMessage: string;
    updatedAt?: string | null;
    updatedByUserId?: string | null;
  };
  publicLeadRouting: {
    useSellerContact: boolean;
    adminCallNumber: string;
    adminWhatsappNumber: string;
    updatedAt?: string | null;
    updatedByUserId?: string | null;
  };
  customerPrime: {
    enabled: boolean;
    upiId: string | null;
    amount: number | null;
    validityValue: number | null;
    validityUnit: 'DAYS' | 'MONTHS';
    recentPayments: PrimePaymentRecord[];
  };
};

type LeadRoutingFormState = {
  useSellerContact: boolean;
  adminCallNumber: string;
  adminWhatsappNumber: string;
};

type CustomerPrimeFormState = {
  enabled: boolean;
  upiId: string;
  amount: string;
  validityValue: string;
  validityUnit: 'DAYS' | 'MONTHS';
};

type MobileOtpFormState = {
  enabled: boolean;
  apiKey: string;
  senderId: string;
  templateId: string;
  templateMessage: string;
};

const getApiErrorMessage = (error: unknown, fallbackMessage: string) => {
  const axiosError = error as AxiosError<{ error?: string }>;
  return axiosError.response?.data?.error || fallbackMessage;
};

export default function SuperAdminSettingsPage() {
  const [activeTab, setActiveTab] = useState<'security' | 'leadRouting' | 'homepage' | 'payments'>('security');
  const [googleClientId, setGoogleClientId] = useState('');
  const [googleAuthEnabled, setGoogleAuthEnabled] = useState(false);
  const [leadRoutingForm, setLeadRoutingForm] = useState<LeadRoutingFormState>({
    useSellerContact: false,
    adminCallNumber: '',
    adminWhatsappNumber: '',
  });
  const [loadingError, setLoadingError] = useState<string | null>(null);
  const [googleSaving, setGoogleSaving] = useState(false);
  const [googleToggleSaving, setGoogleToggleSaving] = useState(false);
  const [leadRoutingSaving, setLeadRoutingSaving] = useState(false);
  const [paymentsSaving, setPaymentsSaving] = useState(false);
  const [customerPrimeForm, setCustomerPrimeForm] = useState<CustomerPrimeFormState>({
    enabled: false,
    upiId: '',
    amount: '',
    validityValue: '',
    validityUnit: 'DAYS',
  });
  
  const [mobileOtpForm, setMobileOtpForm] = useState<MobileOtpFormState>({
    enabled: false,
    apiKey: '',
    senderId: '',
    templateId: '',
    templateMessage: 'Your OTP for JCB Exchange is {#var#}. Validity 5 mins.',
  });
  const [otpSaving, setOtpSaving] = useState(false);

  const loadSettings = useCallback(async () => {
    setLoadingError(null);

    try {
      const response = await api.get<SettingsResponse>('/superadmin/settings');

      setGoogleClientId(response.data.googleAuth.clientId || '');
      setGoogleAuthEnabled(response.data.googleAuth.enabled === true);
      setLeadRoutingForm({
        useSellerContact: response.data.publicLeadRouting.useSellerContact,
        adminCallNumber: response.data.publicLeadRouting.adminCallNumber || '',
        adminWhatsappNumber: response.data.publicLeadRouting.adminWhatsappNumber || '',
      });
      setMobileOtpForm({
        enabled: response.data.mobileOtp.enabled,
        apiKey: response.data.mobileOtp.apiKey || '',
        senderId: response.data.mobileOtp.senderId || '',
        templateId: response.data.mobileOtp.templateId || '',
        templateMessage:
          response.data.mobileOtp.templateMessage ||
          'Your OTP for JCB Exchange is {#var#}. Validity 5 mins.',
      });
      setCustomerPrimeForm({
        enabled: response.data.customerPrime.enabled,
        upiId: response.data.customerPrime.upiId || '',
        amount: response.data.customerPrime.amount ? String(response.data.customerPrime.amount) : '',
        validityValue: response.data.customerPrime.validityValue ? String(response.data.customerPrime.validityValue) : '',
        validityUnit: response.data.customerPrime.validityUnit || 'DAYS',
      });
    } catch (error: unknown) {
      setLoadingError(getApiErrorMessage(error, 'Unable to load platform settings.'));
    }
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void loadSettings();
    }, 0);

    return () => {
      window.clearTimeout(timer);
    };
  }, [loadSettings]);

  const handleGoogleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setGoogleSaving(true);

    try {
      const response = await api.patch<{
        message: string;
        googleAuth: SettingsResponse['googleAuth'];
      }>('/superadmin/settings', {
        googleClientId,
        googleAuthEnabled,
      });

      setGoogleClientId(response.data.googleAuth.clientId || '');
      setGoogleAuthEnabled(response.data.googleAuth.enabled === true);
      toast.success(response.data.message);
    } catch (error: unknown) {
      toast.error(getApiErrorMessage(error, 'Unable to save Google settings.'));
    } finally {
      setGoogleSaving(false);
    }
  };

  const handleGoogleToggle = async () => {
    const nextEnabledState = !googleAuthEnabled;
    setGoogleAuthEnabled(nextEnabledState);
    setGoogleToggleSaving(true);

    try {
      const response = await api.patch<{
        message: string;
        googleAuth: SettingsResponse['googleAuth'];
      }>('/superadmin/settings', {
        googleClientId,
        googleAuthEnabled: nextEnabledState,
      });

      setGoogleClientId(response.data.googleAuth.clientId || '');
      setGoogleAuthEnabled(response.data.googleAuth.enabled === true);
      toast.success(
        response.data.googleAuth.enabled
          ? 'Google login enabled successfully.'
          : 'Google login disabled successfully.',
      );
    } catch (error: unknown) {
      setGoogleAuthEnabled(!nextEnabledState);
      toast.error(getApiErrorMessage(error, 'Unable to update Google login status.'));
    } finally {
      setGoogleToggleSaving(false);
    }
  };

  const handleOtpSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setOtpSaving(true);

    try {
      const response = await api.patch<{
        message: string;
        mobileOtp: SettingsResponse['mobileOtp'];
      }>('/superadmin/settings', {
        mobileOtp: {
          enabled: mobileOtpForm.enabled,
          apiKey: mobileOtpForm.apiKey,
          senderId: mobileOtpForm.senderId,
          templateId: mobileOtpForm.templateId,
          templateMessage: mobileOtpForm.templateMessage,
        },
      });

      setMobileOtpForm({
        enabled: response.data.mobileOtp.enabled,
        apiKey: response.data.mobileOtp.apiKey || '',
        senderId: response.data.mobileOtp.senderId || '',
        templateId: response.data.mobileOtp.templateId || '',
        templateMessage:
          response.data.mobileOtp.templateMessage ||
          'Your OTP for JCB Exchange is {#var#}. Validity 5 mins.',
      });
      toast.success(response.data.message);
    } catch (error: unknown) {
      toast.error(getApiErrorMessage(error, 'Unable to save mobile OTP settings.'));
    } finally {
      setOtpSaving(false);
    }
  };

  const updateMobileOtpForm = (nextState: Partial<MobileOtpFormState>) => {
    setMobileOtpForm((currentState) => ({
      ...currentState,
      ...nextState,
    }));
  };

  const handleLeadRoutingSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setLeadRoutingSaving(true);

    try {
      const response = await api.patch<{
        message: string;
        publicLeadRouting: SettingsResponse['publicLeadRouting'];
      }>('/superadmin/settings', {
        publicLeadRouting: {
          useSellerContact: leadRoutingForm.useSellerContact,
        },
      });

      setLeadRoutingForm({
        useSellerContact: response.data.publicLeadRouting.useSellerContact,
        adminCallNumber: response.data.publicLeadRouting.adminCallNumber || '',
        adminWhatsappNumber: response.data.publicLeadRouting.adminWhatsappNumber || '',
      });
      toast.success(response.data.message);
    } catch (error: unknown) {
      toast.error(getApiErrorMessage(error, 'Unable to save public lead routing settings.'));
    } finally {
      setLeadRoutingSaving(false);
    }
  };

  const updateLeadRoutingForm = (nextState: Partial<LeadRoutingFormState>) => {
    setLeadRoutingForm((currentState) => ({
      ...currentState,
      ...nextState,
    }));
  };

  const handlePaymentsSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setPaymentsSaving(true);

    try {
      const response = await api.patch<{
        message: string;
        customerPrime: SettingsResponse['customerPrime'];
      }>('/superadmin/settings', {
        customerPrime: {
          enabled: customerPrimeForm.enabled,
          upiId: customerPrimeForm.upiId,
          amount: customerPrimeForm.amount ? Number(customerPrimeForm.amount) : undefined,
          validityValue: customerPrimeForm.validityValue ? Number(customerPrimeForm.validityValue) : undefined,
          validityUnit: customerPrimeForm.validityUnit,
        },
      });

      setCustomerPrimeForm({
        enabled: response.data.customerPrime.enabled,
        upiId: response.data.customerPrime.upiId || '',
        amount: response.data.customerPrime.amount ? String(response.data.customerPrime.amount) : '',
        validityValue: response.data.customerPrime.validityValue ? String(response.data.customerPrime.validityValue) : '',
        validityUnit: response.data.customerPrime.validityUnit || 'DAYS',
      });
      toast.success(response.data.message);
    } catch (error: unknown) {
      toast.error(getApiErrorMessage(error, 'Unable to save Prime payment settings.'));
    } finally {
      setPaymentsSaving(false);
    }
  };

  const updateCustomerPrimeForm = (nextState: Partial<CustomerPrimeFormState>) => {
    setCustomerPrimeForm((currentState) => ({
      ...currentState,
      ...nextState,
    }));
  };

  return (
    <div className="mx-auto w-full max-w-7xl space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-gray-900">Settings</h2>
      </div>

      <div className="flex flex-col items-start gap-8 md:flex-row">
        <aside className="w-full flex-shrink-0 md:w-64">
          <nav className="flex flex-col gap-1 rounded-xl border border-gray-200 bg-white p-2 shadow-sm">
            <button
              type="button"
              onClick={() => setActiveTab('security')}
              className={`flex items-center gap-3 rounded-lg border-l-4 px-3 py-2.5 text-sm font-semibold transition-colors ${
                activeTab === 'security'
                  ? 'border-yellow-400 bg-yellow-50 text-yellow-800'
                  : 'border-transparent text-gray-600 hover:bg-gray-50'
              }`}
            >
              <ShieldCheck className="h-4 w-4" />
              Security
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('leadRouting')}
              className={`flex items-center gap-3 rounded-lg border-l-4 px-3 py-2.5 text-sm font-semibold transition-colors ${
                activeTab === 'leadRouting'
                  ? 'border-yellow-400 bg-yellow-50 text-yellow-800'
                  : 'border-transparent text-gray-600 hover:bg-gray-50'
              }`}
            >
              <Phone className="h-4 w-4" />
              Lead Routing
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('homepage')}
              className={`flex items-center gap-3 rounded-lg border-l-4 px-3 py-2.5 text-sm font-semibold transition-colors ${
                activeTab === 'homepage'
                  ? 'border-yellow-400 bg-yellow-50 text-yellow-800'
                  : 'border-transparent text-gray-600 hover:bg-gray-50'
              }`}
            >
              <ImagePlus className="h-4 w-4" />
              Homepage Content
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('payments')}
              className={`flex items-center gap-3 rounded-lg border-l-4 px-3 py-2.5 text-sm font-semibold transition-colors ${
                activeTab === 'payments'
                  ? 'border-yellow-400 bg-yellow-50 text-yellow-800'
                  : 'border-transparent text-gray-600 hover:bg-gray-50'
              }`}
            >
              <CreditCard className="h-4 w-4" />
              Payments
            </button>
          </nav>
        </aside>

        <div className="w-full flex-1 space-y-6">
          {loadingError ? (
            <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              {loadingError}
            </div>
          ) : null}

          {activeTab === 'security' ? (
            <>
              <section className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm">
                <div className="relative overflow-hidden bg-gray-900 px-6 py-8 sm:px-8">
                  <div className="absolute inset-0 bg-gradient-to-r from-gray-900 via-gray-800 to-[#FFC107]/20" />
                  <div className="relative flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
                    <div>
                      <h2 className="text-3xl font-bold tracking-tight text-white">Google Login Control</h2>
                    </div>
                    <span
                      className={`inline-flex w-fit items-center gap-2 rounded-lg border px-3 py-1.5 text-sm font-medium ${
                        googleAuthEnabled
                          ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                          : 'border-amber-200 bg-amber-50 text-amber-700'
                      }`}
                    >
                      <ShieldCheck className="h-4 w-4" />
                      {googleAuthEnabled ? 'Google login enabled' : 'Google login disabled'}
                    </span>
                  </div>
                </div>
              </section>

              <section className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
                <div className="mb-6">
                  <p className="text-xs font-semibold uppercase tracking-wider text-gray-500">Authentication Settings</p>
                  <h3 className="mt-1 text-xl font-bold text-gray-900">Google Client ID</h3>
                </div>

                <form onSubmit={handleGoogleSubmit} className="space-y-5">
                  <div className="rounded-2xl border border-gray-200 bg-gray-50 p-4">
                    <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                      <div>
                        <h4 className="text-sm font-semibold text-gray-900">Enable Google Login For Customers</h4>
                      </div>

                      <button
                        type="button"
                        role="switch"
                        aria-checked={googleAuthEnabled}
                        aria-label="Toggle Google Login"
                        onClick={() => void handleGoogleToggle()}
                        disabled={googleToggleSaving}
                        className={`flex min-w-[168px] items-center justify-between rounded-full border px-2 py-2 text-xs font-bold uppercase tracking-wide transition-colors ${
                          googleAuthEnabled
                            ? 'border-emerald-200 bg-emerald-100 text-emerald-700'
                            : 'border-gray-300 bg-white text-gray-600'
                        } ${googleToggleSaving ? 'cursor-not-allowed opacity-60' : ''}`}
                      >
                        <span
                          className={`relative inline-flex h-8 w-14 items-center rounded-full transition-colors ${
                            googleAuthEnabled ? 'bg-emerald-500' : 'bg-gray-300'
                          }`}
                        >
                          <span
                            className={`inline-block h-6 w-6 transform rounded-full bg-white shadow-sm transition-transform ${
                              googleAuthEnabled ? 'translate-x-7' : 'translate-x-1'
                            }`}
                          />
                        </span>
                        <span className="sr-only">
                          {googleToggleSaving ? 'Updating Google login setting' : 'Toggle Google login'}
                        </span>
                      </button>
                    </div>
                  </div>

                  <label className="block">
                    <span className="mb-1.5 block text-sm font-semibold text-gray-700">Google OAuth Client ID</span>
                    <div className="relative">
                      <KeyRound className="absolute left-3 top-3.5 h-4 w-4 text-gray-400" />
                      <input
                        type="text"
                        value={googleClientId}
                        onChange={(event) => setGoogleClientId(event.target.value)}
                        placeholder="Paste Google web client ID"
                        className="w-full rounded-lg border border-gray-300 bg-white py-3 pl-10 pr-4 text-sm text-gray-900 outline-none transition focus:border-[#FFC107] focus:ring-1 focus:ring-[#FFC107]"
                      />
                    </div>
                  </label>

                  <div className="flex justify-end">
                    <button
                      type="submit"
                      disabled={googleSaving}
                      className="inline-flex items-center gap-2 rounded-lg bg-[#FFC107] px-5 py-2.5 text-sm font-semibold text-black transition hover:bg-[#E5AD06] disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      <Save className="h-4 w-4" />
                      {googleSaving ? 'Saving...' : 'Save Google Settings'}
                    </button>
                  </div>
                </form>
              </section>

              <section className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
                <div className="mb-6">
                  <p className="text-xs font-semibold uppercase tracking-wider text-gray-500">Authentication Settings</p>
                  <h3 className="mt-1 text-xl font-bold text-gray-900">Mobile OTP Settings</h3>
                </div>

                <form onSubmit={handleOtpSubmit} className="space-y-6">
                  <div className="rounded-2xl border border-gray-200 bg-gray-50 p-4">
                    <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                      <div>
                        <h4 className="text-sm font-semibold text-gray-900">Enable Mobile OTP Authentication</h4>
                      </div>

                      <button
                        type="button"
                        role="switch"
                        aria-checked={mobileOtpForm.enabled}
                        aria-label="Toggle Mobile OTP"
                        onClick={() =>
                          updateMobileOtpForm({
                            enabled: !mobileOtpForm.enabled,
                          })
                        }
                        className={`flex min-w-[168px] items-center justify-between rounded-full border px-2 py-2 text-xs font-bold uppercase tracking-wide transition-colors ${
                          mobileOtpForm.enabled
                            ? 'border-emerald-200 bg-emerald-100 text-emerald-700'
                            : 'border-gray-300 bg-white text-gray-600'
                        }`}
                      >
                        <span
                          className={`relative inline-flex h-8 w-14 items-center rounded-full transition-colors ${
                            mobileOtpForm.enabled ? 'bg-emerald-500' : 'bg-gray-300'
                          }`}
                        >
                          <span
                            className={`inline-block h-6 w-6 transform rounded-full bg-white shadow-sm transition-transform ${
                              mobileOtpForm.enabled ? 'translate-x-7' : 'translate-x-1'
                            }`}
                          />
                        </span>
                      </button>
                    </div>
                  </div>

                  <div className="grid gap-5 md:grid-cols-2">
                    <label className="block">
                        <span className="mb-1.5 block text-sm font-semibold text-gray-700">SMS Gateway API Key</span>
                        <input
                          type="text"
                          value={mobileOtpForm.apiKey}
                          onChange={(event) => updateMobileOtpForm({ apiKey: event.target.value })}
                          placeholder="e.g. AIzaSyA1..."
                          disabled={!mobileOtpForm.enabled}
                          className="w-full rounded-lg border border-gray-300 bg-white px-4 py-3 text-sm text-gray-900 outline-none transition focus:border-[#FFC107] focus:ring-1 focus:ring-[#FFC107] disabled:bg-gray-50 disabled:text-gray-400"
                        />
                      </label>

                    <label className="block">
                        <span className="mb-1.5 block text-sm font-semibold text-gray-700">Sender ID</span>
                        <input
                          type="text"
                          value={mobileOtpForm.senderId}
                          onChange={(event) => updateMobileOtpForm({ senderId: event.target.value })}
                          placeholder="e.g. JCBEXC"
                          maxLength={6}
                          disabled={!mobileOtpForm.enabled}
                          className="w-full rounded-lg border border-gray-300 bg-white px-4 py-3 text-sm text-gray-900 outline-none transition focus:border-[#FFC107] focus:ring-1 focus:ring-[#FFC107] disabled:bg-gray-50 disabled:text-gray-400"
                        />
                      </label>
                  </div>

                  <div className="grid gap-5 md:grid-cols-2">
                    <label className="block">
                        <span className="mb-1.5 block text-sm font-semibold text-gray-700">DLT Template ID</span>
                        <input
                          type="text"
                          value={mobileOtpForm.templateId}
                          onChange={(event) => updateMobileOtpForm({ templateId: event.target.value })}
                          placeholder="e.g. 1207161..."
                          disabled={!mobileOtpForm.enabled}
                          className="w-full rounded-lg border border-gray-300 bg-white px-4 py-3 text-sm text-gray-900 outline-none transition focus:border-[#FFC107] focus:ring-1 focus:ring-[#FFC107] disabled:bg-gray-50 disabled:text-gray-400"
                        />
                      </label>

                    <label className="block">
                        <span className="mb-1.5 block text-sm font-semibold text-gray-700">OTP Template Message</span>
                        <input
                          type="text"
                          value={mobileOtpForm.templateMessage}
                          onChange={(event) =>
                            updateMobileOtpForm({ templateMessage: event.target.value })
                          }
                          disabled={!mobileOtpForm.enabled}
                          className="w-full rounded-lg border border-gray-300 bg-white px-4 py-3 text-sm text-gray-900 outline-none transition focus:border-[#FFC107] focus:ring-1 focus:ring-[#FFC107] disabled:bg-gray-50 disabled:text-gray-400"
                        />
                      </label>
                  </div>

                  <div className="flex justify-end border-t border-gray-100 pt-2">
                    <button
                      type="submit"
                      disabled={otpSaving}
                      className="inline-flex items-center gap-2 rounded-lg bg-[#FFC107] px-5 py-2.5 text-sm font-semibold text-black transition hover:bg-[#E5AD06] disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      <Save className="h-4 w-4" />
                      {otpSaving ? 'Saving...' : 'Save OTP Settings'}
                    </button>
                  </div>
                </form>
              </section>
            </>
          ) : null}

          {activeTab === 'leadRouting' ? (
            <>
              <section className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm">
                <div className="relative overflow-hidden bg-gray-900 px-6 py-8 sm:px-8">
                  <div className="absolute inset-0 bg-gradient-to-r from-gray-900 via-gray-800 to-[#FFC107]/20" />
                  <div className="relative flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-[0.3em] text-yellow-200">Public Leads</p>
                      <h2 className="mt-2 text-3xl font-bold tracking-tight text-white">Lead Routing Control</h2>
                    </div>
                    <span
                      className={`inline-flex w-fit items-center gap-2 rounded-lg border px-3 py-1.5 text-sm font-medium ${
                        leadRoutingForm.useSellerContact
                          ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                          : 'border-amber-200 bg-amber-50 text-amber-700'
                      }`}
                    >
                      <Phone className="h-4 w-4" />
                      {leadRoutingForm.useSellerContact ? 'Seller contact mode enabled' : 'Super admin mode enabled'}
                    </span>
                  </div>
                </div>
              </section>

              <section className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
                <div className="mb-6">
                  <p className="text-xs font-semibold uppercase tracking-wider text-gray-500">Routing Rules</p>
                  <h3 className="mt-1 text-xl font-bold text-gray-900">Use Seller Contact For Public Leads</h3>
                </div>

                <form onSubmit={handleLeadRoutingSubmit} className="space-y-6">
                  <div className="rounded-2xl border border-gray-200 bg-gray-50 p-4">
                    <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                      <div>
                        <h4 className="text-sm font-semibold text-gray-900">Route public Call, WhatsApp, and Get In Touch to seller</h4>
                      </div>

                      <button
                        type="button"
                        role="switch"
                        aria-checked={leadRoutingForm.useSellerContact}
                        aria-label="Toggle public lead routing between super admin and seller"
                        onClick={() =>
                          updateLeadRoutingForm({
                            useSellerContact: !leadRoutingForm.useSellerContact,
                          })
                        }
                        className={`flex min-w-[168px] items-center justify-between rounded-full border px-2 py-2 text-xs font-bold uppercase tracking-wide transition-colors ${
                          leadRoutingForm.useSellerContact
                            ? 'border-emerald-200 bg-emerald-100 text-emerald-700'
                            : 'border-gray-300 bg-white text-gray-600'
                        }`}
                      >
                        <span
                          className={`relative inline-flex h-8 w-14 items-center rounded-full transition-colors ${
                            leadRoutingForm.useSellerContact ? 'bg-emerald-500' : 'bg-gray-300'
                          }`}
                        >
                          <span
                            className={`inline-block h-6 w-6 transform rounded-full bg-white shadow-sm transition-transform ${
                              leadRoutingForm.useSellerContact ? 'translate-x-7' : 'translate-x-1'
                            }`}
                          />
                        </span>
                      </button>
                    </div>
                  </div>

                  <div className="grid gap-5 md:grid-cols-2">
                    <label className="block">
                      <span className="mb-1.5 block text-sm font-semibold text-gray-700">Super Admin Call Number</span>
                      <input
                        type="text"
                        value={leadRoutingForm.adminCallNumber}
                        readOnly
                        aria-readonly="true"
                        placeholder="No super admin call number configured"
                        className="w-full cursor-not-allowed rounded-lg border border-gray-200 bg-gray-100 px-4 py-3 text-sm text-gray-700 outline-none"
                      />
                    </label>

                    <label className="block">
                      <span className="mb-1.5 block text-sm font-semibold text-gray-700">Super Admin WhatsApp Number</span>
                      <input
                        type="text"
                        value={leadRoutingForm.adminWhatsappNumber}
                        readOnly
                        aria-readonly="true"
                        placeholder="No super admin WhatsApp number configured"
                        className="w-full cursor-not-allowed rounded-lg border border-gray-200 bg-gray-100 px-4 py-3 text-sm text-gray-700 outline-none"
                      />
                    </label>
                  </div>

                  <div className="flex justify-end">
                    <button
                      type="submit"
                      disabled={leadRoutingSaving}
                      className="inline-flex items-center gap-2 rounded-lg bg-[#FFC107] px-5 py-2.5 text-sm font-semibold text-black transition hover:bg-[#E5AD06] disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      <Save className="h-4 w-4" />
                      {leadRoutingSaving ? 'Saving...' : 'Save Lead Routing'}
                    </button>
                  </div>
                </form>
              </section>
            </>
          ) : null}

          {activeTab === 'homepage' ? <HomepageContentSettings /> : null}

          {activeTab === 'payments' ? (
            <>
              <section className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm">
                <div className="relative overflow-hidden bg-gray-900 px-6 py-8 sm:px-8">
                  <div className="absolute inset-0 bg-gradient-to-r from-gray-900 via-gray-800 to-[#FFC107]/20" />
                  <div className="relative flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-[0.3em] text-yellow-200">Prime Access</p>
                      <h2 className="mt-2 text-3xl font-bold tracking-tight text-white">Customer Prime Payment Settings</h2>
                    </div>
                    <span
                      className={`inline-flex w-fit items-center gap-2 rounded-lg border px-3 py-1.5 text-sm font-medium ${
                        customerPrimeForm.enabled
                          ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                          : 'border-amber-200 bg-amber-50 text-amber-700'
                      }`}
                    >
                      <CreditCard className="h-4 w-4" />
                      {customerPrimeForm.enabled ? 'Prime payments enabled' : 'Prime payments disabled'}
                    </span>
                  </div>
                </div>
              </section>

              <section className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
                <div className="mb-6">
                  <p className="text-xs font-semibold uppercase tracking-wider text-gray-500">Subscription Rules</p>
                  <h3 className="mt-1 text-xl font-bold text-gray-900">Prime Customer Configuration</h3>
                </div>

                <form onSubmit={handlePaymentsSubmit} className="space-y-6">
                  <div className="rounded-2xl border border-gray-200 bg-gray-50 p-4">
                    <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                      <div>
                        <h4 className="text-sm font-semibold text-gray-900">Enable Prime payment gate for customers</h4>
                        <p className="mt-1 text-sm text-gray-500">
                          When enabled, customer Call, WhatsApp, and Sell Vehicle actions automatically require Prime access.
                        </p>
                      </div>

                      <button
                        type="button"
                        role="switch"
                        aria-checked={customerPrimeForm.enabled}
                        aria-label="Toggle customer Prime payments"
                        onClick={() => updateCustomerPrimeForm({ enabled: !customerPrimeForm.enabled })}
                        className={`flex min-w-[168px] items-center justify-between rounded-full border px-2 py-2 text-xs font-bold uppercase tracking-wide transition-colors ${
                          customerPrimeForm.enabled
                            ? 'border-emerald-200 bg-emerald-100 text-emerald-700'
                            : 'border-gray-300 bg-white text-gray-600'
                        }`}
                      >
                        <span
                          className={`relative inline-flex h-8 w-14 items-center rounded-full transition-colors ${
                            customerPrimeForm.enabled ? 'bg-emerald-500' : 'bg-gray-300'
                          }`}
                        >
                          <span
                            className={`inline-block h-6 w-6 transform rounded-full bg-white shadow-sm transition-transform ${
                              customerPrimeForm.enabled ? 'translate-x-7' : 'translate-x-1'
                            }`}
                          />
                        </span>
                      </button>
                    </div>
                  </div>

                  <div className="grid gap-5 md:grid-cols-2">
                    <label className="block">
                      <span className="mb-1.5 block text-sm font-semibold text-gray-700">UPI ID / Number</span>
                      <input
                        type="text"
                        value={customerPrimeForm.upiId}
                        onChange={(event) => updateCustomerPrimeForm({ upiId: event.target.value })}
                        placeholder="e.g. 9876543210@upi"
                        className="w-full rounded-lg border border-gray-300 bg-white px-4 py-3 text-sm text-gray-900 outline-none transition focus:border-[#FFC107] focus:ring-1 focus:ring-[#FFC107]"
                      />
                    </label>

                    <label className="block">
                      <span className="mb-1.5 block text-sm font-semibold text-gray-700">Subscription Amount</span>
                      <input
                        type="number"
                        value={customerPrimeForm.amount}
                        onChange={(event) => updateCustomerPrimeForm({ amount: event.target.value })}
                        placeholder="e.g. 500"
                        min="0"
                        step="0.01"
                        className="w-full rounded-lg border border-gray-300 bg-white px-4 py-3 text-sm text-gray-900 outline-none transition focus:border-[#FFC107] focus:ring-1 focus:ring-[#FFC107]"
                      />
                    </label>
                  </div>

                  <div className="grid gap-5 md:grid-cols-[1fr_220px]">
                    <label className="block">
                      <span className="mb-1.5 block text-sm font-semibold text-gray-700">Validity Value</span>
                      <input
                        type="number"
                        value={customerPrimeForm.validityValue}
                        onChange={(event) => updateCustomerPrimeForm({ validityValue: event.target.value })}
                        placeholder="e.g. 30"
                        min="1"
                        className="w-full rounded-lg border border-gray-300 bg-white px-4 py-3 text-sm text-gray-900 outline-none transition focus:border-[#FFC107] focus:ring-1 focus:ring-[#FFC107]"
                      />
                    </label>

                    <label className="block">
                      <span className="mb-1.5 block text-sm font-semibold text-gray-700">Validity Unit</span>
                      <select
                        value={customerPrimeForm.validityUnit}
                        onChange={(event) =>
                          updateCustomerPrimeForm({
                            validityUnit: event.target.value as CustomerPrimeFormState['validityUnit'],
                          })
                        }
                        className="w-full rounded-lg border border-gray-300 bg-white px-4 py-3 text-sm text-gray-900 outline-none transition focus:border-[#FFC107] focus:ring-1 focus:ring-[#FFC107]"
                      >
                        <option value="DAYS">Days</option>
                        <option value="MONTHS">Months</option>
                      </select>
                    </label>
                  </div>

                  <div className="rounded-2xl border border-amber-100 bg-amber-50 px-4 py-4 text-sm text-amber-800">
                    Prime payment is always customer-only and always includes Call, WhatsApp, and Sell Vehicle access together.
                  </div>

                  <div className="flex justify-end border-t border-gray-100 pt-2">
                    <button
                      type="submit"
                      disabled={paymentsSaving}
                      className="inline-flex items-center gap-2 rounded-lg bg-[#FFC107] px-5 py-2.5 text-sm font-semibold text-black transition hover:bg-[#E5AD06] disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      <Save className="h-4 w-4" />
                      {paymentsSaving ? 'Saving...' : 'Save Prime Settings'}
                    </button>
                  </div>
                </form>
              </section>


            </>
          ) : null}
        </div>
      </div>
    </div>
  );
}
