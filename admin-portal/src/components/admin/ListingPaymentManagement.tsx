'use client';

import { useCallback, useEffect, useState } from 'react';
import type { AxiosError } from 'axios';
import { Building2, CheckCircle2, CreditCard, ExternalLink, RefreshCcw, Save, XCircle } from 'lucide-react';
import { toast } from 'react-toastify';
import api, { API_ORIGIN } from '@/lib/api';
import BrandLoader from '@/components/ui/BrandLoader';

type ListingPaymentFormState = {
  rtgs: {
    enabled: boolean;
    beneficiaryName: string;
    bankName: string;
    accountNumber: string;
    ifscCode: string;
    branchName: string;
    instructions: string;
  };
  razorpay: {
    enabled: boolean;
    keyId: string;
    keySecret: string;
    webhookSecret: string;
    mode: 'TEST' | 'LIVE';
  };
  phonepe: {
    enabled: boolean;
    clientId: string;
    clientSecret: string;
    clientVersion: string;
    mode?: 'TEST' | 'LIVE';
  };
};

type ListingPaymentRecord = {
  id: string;
  method: 'RTGS' | 'RAZORPAY' | 'PHONEPE';
  status: 'PENDING_VERIFICATION' | 'APPROVED' | 'REJECTED' | 'FAILED' | 'PAID';
  amount: number;
  transactionRef: string | null;
  paymentNote: string | null;
  receiptUrl: string | null;
  submittedAt: string;
  rejectionReason: string | null;
  buyer: { name?: string | null; mobile?: string | null; email?: string | null } | null;
  partner: { name?: string | null; mobile?: string | null; email?: string | null } | null;
  listing: { title: string; status: string; price: number } | null;
};

type SettingsResponse = {
  listingPayment: ListingPaymentFormState;
};

type ListingPaymentFormPatch = {
  rtgs?: Partial<ListingPaymentFormState['rtgs']>;
  razorpay?: Partial<ListingPaymentFormState['razorpay']>;
  phonepe?: Partial<ListingPaymentFormState['phonepe']>;
};

const emptyListingPaymentForm: ListingPaymentFormState = {
  rtgs: {
    enabled: false,
    beneficiaryName: '',
    bankName: '',
    accountNumber: '',
    ifscCode: '',
    branchName: '',
    instructions: '',
  },
  razorpay: {
    enabled: false,
    keyId: '',
    keySecret: '',
    webhookSecret: '',
    mode: 'TEST',
  },
  phonepe: {
    enabled: false,
    clientId: '',
    clientSecret: '',
    clientVersion: '1',
  },
};

const getApiErrorMessage = (error: unknown, fallbackMessage: string) => {
  const axiosError = error as AxiosError<{ error?: string }>;
  return axiosError.response?.data?.error || fallbackMessage;
};

const getAbsoluteFileUrl = (url?: string | null) => {
  if (!url) return '';
  if (/^https?:\/\//i.test(url)) return url;
  return `${API_ORIGIN}${url.startsWith('/') ? '' : '/'}${url}`;
};

const detectRazorpayModeFromKeyId = (keyId?: string | null): 'TEST' | 'LIVE' | null => {
  const normalizedKeyId = keyId?.trim();
  if (!normalizedKeyId) {
    return null;
  }

  if (normalizedKeyId.startsWith('rzp_test_')) {
    return 'TEST';
  }

  if (normalizedKeyId.startsWith('rzp_live_')) {
    return 'LIVE';
  }

  return null;
};

const detectPhonePeModeFromClientId = (clientId?: string | null): 'TEST' | 'LIVE' => {
  const normalizedClientId = clientId?.trim().toUpperCase() || '';
  if (!normalizedClientId) {
    return 'TEST';
  }

  return /(?:TEST|UAT|SANDBOX|PREPROD)/.test(normalizedClientId) ? 'TEST' : 'LIVE';
};

function SettingsInput({
  label,
  value,
  onChange,
  type = 'text',
  disabled = false,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: 'text' | 'password';
  disabled?: boolean;
  placeholder?: string;
}) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-sm font-semibold text-gray-700">{label}</span>
      <input
        type={type}
        value={value}
        disabled={disabled}
        placeholder={placeholder}
        onChange={(event) => onChange(event.target.value)}
        className="w-full rounded-lg border border-gray-300 bg-white px-4 py-3 text-sm text-gray-900 outline-none transition focus:border-[#FFC107] focus:ring-1 focus:ring-[#FFC107] disabled:cursor-not-allowed disabled:bg-gray-100 disabled:text-gray-400"
      />
    </label>
  );
}

export default function ListingPaymentManagement() {
  const [loadingError, setLoadingError] = useState<string | null>(null);
  const [listingPaymentSaving, setListingPaymentSaving] = useState(false);
  const [listingPaymentsLoading, setListingPaymentsLoading] = useState(false);
  const [listingPayments, setListingPayments] = useState<ListingPaymentRecord[]>([]);
  const [listingPaymentForm, setListingPaymentForm] = useState<ListingPaymentFormState>(emptyListingPaymentForm);

  const updateListingPaymentForm = (nextState: ListingPaymentFormPatch) => {
    setListingPaymentForm((currentState) => ({
      ...currentState,
      ...nextState,
      rtgs: {
        ...currentState.rtgs,
        ...nextState.rtgs,
      },
      razorpay: {
        ...currentState.razorpay,
        ...nextState.razorpay,
      },
      phonepe: {
        ...currentState.phonepe,
        ...nextState.phonepe,
      },
    }));
  };

  const loadSettings = useCallback(async () => {
    setLoadingError(null);

    try {
      const response = await api.get<SettingsResponse>('/superadmin/settings');
      setListingPaymentForm({
        rtgs: {
          enabled: response.data.listingPayment?.rtgs?.enabled === true,
          beneficiaryName: response.data.listingPayment?.rtgs?.beneficiaryName || '',
          bankName: response.data.listingPayment?.rtgs?.bankName || '',
          accountNumber: response.data.listingPayment?.rtgs?.accountNumber || '',
          ifscCode: response.data.listingPayment?.rtgs?.ifscCode || '',
          branchName: response.data.listingPayment?.rtgs?.branchName || '',
          instructions: response.data.listingPayment?.rtgs?.instructions || '',
        },
        razorpay: {
          enabled: response.data.listingPayment?.razorpay?.enabled === true,
          keyId: response.data.listingPayment?.razorpay?.keyId || '',
          keySecret: response.data.listingPayment?.razorpay?.keySecret || '',
          webhookSecret: response.data.listingPayment?.razorpay?.webhookSecret || '',
          mode: response.data.listingPayment?.razorpay?.mode || 'TEST',
        },
        phonepe: {
          enabled: response.data.listingPayment?.phonepe?.enabled === true,
          clientId: response.data.listingPayment?.phonepe?.clientId || '',
          clientSecret: response.data.listingPayment?.phonepe?.clientSecret || '',
          clientVersion: response.data.listingPayment?.phonepe?.clientVersion || '1',
          mode: response.data.listingPayment?.phonepe?.mode || 'TEST',
        },
      });
    } catch (error: unknown) {
      setLoadingError(getApiErrorMessage(error, 'Unable to load buy now payment settings.'));
    }
  }, []);

  const loadListingPayments = useCallback(async () => {
    setListingPaymentsLoading(true);
    try {
      const response = await api.get<{ payments: ListingPaymentRecord[] }>('/superadmin/listing-payments');
      setListingPayments(response.data.payments || []);
    } catch (error: unknown) {
      toast.error(getApiErrorMessage(error, 'Unable to load listing payment receipts.'));
    } finally {
      setListingPaymentsLoading(false);
    }
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void loadSettings();
      void loadListingPayments();
    }, 0);

    return () => {
      window.clearTimeout(timer);
    };
  }, [loadListingPayments, loadSettings]);

  const handleListingPaymentSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setListingPaymentSaving(true);

    try {
      const rtgsReady = Boolean(
        listingPaymentForm.rtgs.beneficiaryName.trim() &&
        listingPaymentForm.rtgs.bankName.trim() &&
        listingPaymentForm.rtgs.accountNumber.trim() &&
        listingPaymentForm.rtgs.ifscCode.trim(),
      );
      const detectedRazorpayMode = detectRazorpayModeFromKeyId(listingPaymentForm.razorpay.keyId);

      if (listingPaymentForm.rtgs.enabled && !rtgsReady) {
        toast.error('Beneficiary name, bank name, account number, and IFSC code are required when RTGS is enabled.');
        return;
      }

      if (listingPaymentForm.razorpay.enabled && !detectedRazorpayMode) {
        toast.error('Valid Razorpay Key ID is required. It must start with rzp_test_ or rzp_live_.');
        return;
      }

      if (
        listingPaymentForm.phonepe.enabled &&
        !(
          listingPaymentForm.phonepe.clientId.trim() &&
          listingPaymentForm.phonepe.clientSecret.trim() &&
          listingPaymentForm.phonepe.clientVersion.trim()
        )
      ) {
        toast.error('PhonePe Client ID, Client Secret, and Client Version are required when PhonePe is enabled.');
        return;
      }

      const response = await api.patch<{
        message: string;
        listingPayment: ListingPaymentFormState;
      }>('/superadmin/settings', {
        listingPayment: {
          ...listingPaymentForm,
          razorpay: {
            ...listingPaymentForm.razorpay,
            mode: detectedRazorpayMode || listingPaymentForm.razorpay.mode,
          },
          phonepe: {
            ...listingPaymentForm.phonepe,
            mode: detectPhonePeModeFromClientId(listingPaymentForm.phonepe.clientId),
          },
        },
      });

      setListingPaymentForm({
        rtgs: {
          enabled: response.data.listingPayment.rtgs.enabled,
          beneficiaryName: response.data.listingPayment.rtgs.beneficiaryName || '',
          bankName: response.data.listingPayment.rtgs.bankName || '',
          accountNumber: response.data.listingPayment.rtgs.accountNumber || '',
          ifscCode: response.data.listingPayment.rtgs.ifscCode || '',
          branchName: response.data.listingPayment.rtgs.branchName || '',
          instructions: response.data.listingPayment.rtgs.instructions || '',
        },
        razorpay: {
          enabled: response.data.listingPayment.razorpay.enabled,
          keyId: response.data.listingPayment.razorpay.keyId || '',
          keySecret: response.data.listingPayment.razorpay.keySecret || '',
          webhookSecret: response.data.listingPayment.razorpay.webhookSecret || '',
          mode: response.data.listingPayment.razorpay.mode || 'TEST',
        },
        phonepe: {
          enabled: response.data.listingPayment.phonepe.enabled,
          clientId: response.data.listingPayment.phonepe.clientId || '',
          clientSecret: response.data.listingPayment.phonepe.clientSecret || '',
          clientVersion: response.data.listingPayment.phonepe.clientVersion || '1',
          mode: response.data.listingPayment.phonepe.mode || 'TEST',
        },
      });
      toast.success(response.data.message);
      void loadListingPayments();
    } catch (error: unknown) {
      toast.error(getApiErrorMessage(error, 'Unable to save listing payment settings.'));
    } finally {
      setListingPaymentSaving(false);
    }
  };

  const handleListingPaymentStatus = async (paymentId: string, status: 'APPROVED' | 'REJECTED') => {
    const rejectionReason = status === 'REJECTED' ? window.prompt('Reason for rejection?') || '' : '';

    try {
      const response = await api.patch<{ message: string; payment: ListingPaymentRecord }>(
        `/superadmin/listing-payments/${paymentId}/status`,
        { status, rejectionReason },
      );
      setListingPayments((current) => current.map((payment) => (payment.id === paymentId ? response.data.payment : payment)));
      toast.success(response.data.message);
    } catch (error: unknown) {
      toast.error(getApiErrorMessage(error, 'Unable to update payment status.'));
    }
  };

  const rtgsReady = Boolean(
    listingPaymentForm.rtgs.beneficiaryName.trim() &&
    listingPaymentForm.rtgs.bankName.trim() &&
    listingPaymentForm.rtgs.accountNumber.trim() &&
    listingPaymentForm.rtgs.ifscCode.trim(),
  );
  const rtgsIsIncomplete = listingPaymentForm.rtgs.enabled && !rtgsReady;
  const detectedRazorpayMode = detectRazorpayModeFromKeyId(listingPaymentForm.razorpay.keyId);
  const razorpayFieldsDisabled = !listingPaymentForm.razorpay.enabled;
  const phonePeFieldsDisabled = !listingPaymentForm.phonepe.enabled;
  const normalizedPhonePeClientId = listingPaymentForm.phonepe.clientId.trim().toUpperCase();
  const detectedPhonePeMode = normalizedPhonePeClientId
    ? /(?:TEST|UAT|SANDBOX|PREPROD)/.test(normalizedPhonePeClientId) ? 'TEST' : 'LIVE'
    : null;

  return (
    <div className="space-y-6">
      {loadingError ? (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {loadingError}
        </div>
      ) : null}

      <section className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm">
        <div className="relative overflow-hidden bg-gray-900 px-6 py-8 sm:px-8">
          <div className="absolute inset-0 bg-gradient-to-r from-gray-900 via-gray-800 to-[#FFC107]/20" />
          <div className="relative flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.3em] text-yellow-200">Listing Payments</p>
              <h2 className="mt-2 text-3xl font-bold tracking-tight text-white">Buy Now Payment Settings</h2>
            </div>
            <span className="inline-flex w-fit items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-1.5 text-sm font-medium text-amber-800">
              <CreditCard className="h-4 w-4" />
              {listingPayments.length} submissions
            </span>
          </div>
        </div>
      </section>

      <section className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
        <div className="mb-6 flex items-center justify-between gap-3 border-b border-gray-100 pb-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-gray-500">Listing Payments</p>
            <h3 className="mt-1 text-xl font-bold text-gray-900">RTGS, Razorpay, and PhonePe Configuration</h3>
          </div>
          <span className="inline-flex w-fit items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3.5 py-1.5 text-xs font-bold text-amber-800">
            <Building2 className="h-4 w-4 text-amber-600" />
            Buy Now Gateway
          </span>
        </div>

        <form onSubmit={handleListingPaymentSubmit} className="space-y-8">
          <div className="rounded-2xl border border-gray-200 bg-gray-50/60 p-5 sm:p-6 shadow-xs">
            <div className="mb-5 flex items-center justify-between gap-4 border-b border-gray-200/80 pb-4">
              <div>
                <h4 className="text-base font-bold text-gray-900">RTGS / Bank Transfer</h4>
                <p className="mt-0.5 text-xs font-medium text-gray-500">Shown to customer after Buy Now click for manual bank transfer.</p>
              </div>
              <div className="flex items-center gap-3">
                <span className={`text-xs font-bold ${rtgsIsIncomplete ? 'text-amber-700' : listingPaymentForm.rtgs.enabled ? 'text-emerald-700' : 'text-gray-500'}`}>
                  {rtgsIsIncomplete ? 'INCOMPLETE' : listingPaymentForm.rtgs.enabled ? 'ENABLED' : 'DISABLED'}
                </span>
                <button
                  type="button"
                  role="switch"
                  aria-checked={listingPaymentForm.rtgs.enabled}
                  onClick={() => updateListingPaymentForm({ rtgs: { enabled: !listingPaymentForm.rtgs.enabled } })}
                  className={`relative inline-flex h-7 w-12 items-center rounded-full transition-colors ${listingPaymentForm.rtgs.enabled ? 'bg-emerald-500' : 'bg-gray-300'}`}
                >
                  <span className={`inline-block h-5 w-5 transform rounded-full bg-white shadow-md transition-transform ${listingPaymentForm.rtgs.enabled ? 'translate-x-6' : 'translate-x-1'}`} />
                </button>
              </div>
            </div>

            {rtgsIsIncomplete ? (
              <div className="mb-5 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-800">
                RTGS is enabled but not ready. Fill Beneficiary Name, Bank Name, Account Number, and IFSC Code, then save to show Buy Now on frontend.
              </div>
            ) : null}

            <div className="grid gap-5 md:grid-cols-2">
              <SettingsInput label="Beneficiary Name *" value={listingPaymentForm.rtgs.beneficiaryName} onChange={(value) => updateListingPaymentForm({ rtgs: { beneficiaryName: value } })} />
              <SettingsInput label="Bank Name *" value={listingPaymentForm.rtgs.bankName} onChange={(value) => updateListingPaymentForm({ rtgs: { bankName: value } })} />
              <SettingsInput label="Account Number *" value={listingPaymentForm.rtgs.accountNumber} onChange={(value) => updateListingPaymentForm({ rtgs: { accountNumber: value } })} />
              <SettingsInput label="IFSC Code *" value={listingPaymentForm.rtgs.ifscCode} onChange={(value) => updateListingPaymentForm({ rtgs: { ifscCode: value } })} />
              <SettingsInput label="Branch Name" value={listingPaymentForm.rtgs.branchName} onChange={(value) => updateListingPaymentForm({ rtgs: { branchName: value } })} />
              <div className="md:col-span-2">
                <label className="block">
                  <span className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-gray-700">Payment Instructions</span>
                  <textarea
                    value={listingPaymentForm.rtgs.instructions}
                    onChange={(event) => updateListingPaymentForm({ rtgs: { instructions: event.target.value } })}
                    rows={3}
                    placeholder="Enter instructions for customer regarding RTGS/Bank transfer..."
                    className="w-full rounded-xl border border-gray-300 bg-white px-4 py-2.5 text-sm font-medium text-gray-900 outline-none transition focus:border-[#FFC107] focus:ring-2 focus:ring-[#FFC107]/20"
                  />
                </label>
              </div>
            </div>
          </div>

          <div className="rounded-2xl border border-gray-200 bg-gray-50/60 p-5 sm:p-6 shadow-xs">
            <div className="mb-5 flex items-center justify-between gap-4 border-b border-gray-200/80 pb-4">
              <div>
                <h4 className="text-base font-bold text-gray-900">Razorpay Online Gateway</h4>
                <p className="mt-0.5 text-xs font-medium text-gray-500">Mode is auto-detected from Key ID. Secrets stay server-side and are masked after saving.</p>
              </div>
              <div className="flex items-center gap-3">
                <span className={`text-xs font-bold ${listingPaymentForm.razorpay.enabled ? 'text-emerald-700' : 'text-gray-500'}`}>
                  {listingPaymentForm.razorpay.enabled ? 'ENABLED' : 'DISABLED'}
                </span>
                <button
                  type="button"
                  role="switch"
                  aria-checked={listingPaymentForm.razorpay.enabled}
                  onClick={() => updateListingPaymentForm({ razorpay: { enabled: !listingPaymentForm.razorpay.enabled } })}
                  className={`relative inline-flex h-7 w-12 items-center rounded-full transition-colors ${listingPaymentForm.razorpay.enabled ? 'bg-emerald-500' : 'bg-gray-300'}`}
                >
                  <span className={`inline-block h-5 w-5 transform rounded-full bg-white shadow-md transition-transform ${listingPaymentForm.razorpay.enabled ? 'translate-x-6' : 'translate-x-1'}`} />
                </button>
              </div>
            </div>

            <div className="grid gap-5 md:grid-cols-2">
              <div className="rounded-xl border border-gray-200 bg-white px-4 py-3">
                <span className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-gray-700">Detected Mode</span>
                <span className={`inline-flex rounded-full px-3 py-1 text-xs font-bold ${
                  detectedRazorpayMode === 'LIVE'
                    ? 'bg-emerald-50 text-emerald-700'
                    : detectedRazorpayMode === 'TEST'
                      ? 'bg-blue-50 text-blue-700'
                      : 'bg-gray-100 text-gray-500'
                }`}>
                  {razorpayFieldsDisabled ? 'Enable Razorpay first' : detectedRazorpayMode ? `${detectedRazorpayMode} Mode` : 'Not detected'}
                </span>
                {!razorpayFieldsDisabled && !detectedRazorpayMode ? (
                  <p className="mt-2 text-xs font-medium text-red-600">Key ID must start with rzp_test_ or rzp_live_.</p>
                ) : null}
              </div>
              <SettingsInput
                label="Key ID"
                value={razorpayFieldsDisabled ? '' : listingPaymentForm.razorpay.keyId}
                onChange={(value) => updateListingPaymentForm({ razorpay: { keyId: value } })}
                disabled={razorpayFieldsDisabled}
                placeholder={razorpayFieldsDisabled ? 'Enable Razorpay to add Key ID' : 'rzp_live_xxxxx or rzp_test_xxxxx'}
              />
              <SettingsInput
                label="Key Secret"
                type="password"
                value={razorpayFieldsDisabled ? '' : listingPaymentForm.razorpay.keySecret}
                onChange={(value) => updateListingPaymentForm({ razorpay: { keySecret: value } })}
                disabled={razorpayFieldsDisabled}
                placeholder={razorpayFieldsDisabled ? 'Enable Razorpay to add secret' : 'Leave masked value to keep existing secret'}
              />
              <SettingsInput
                label="Webhook Secret"
                type="password"
                value={razorpayFieldsDisabled ? '' : listingPaymentForm.razorpay.webhookSecret}
                onChange={(value) => updateListingPaymentForm({ razorpay: { webhookSecret: value } })}
                disabled={razorpayFieldsDisabled}
                placeholder={razorpayFieldsDisabled ? 'Enable Razorpay to add webhook secret' : 'Optional'}
              />
            </div>
          </div>

          <div className="rounded-2xl border border-gray-200 bg-gray-50/60 p-5 sm:p-6 shadow-xs">
            <div className="mb-5 flex items-center justify-between gap-4 border-b border-gray-200/80 pb-4">
              <div>
                <h4 className="text-base font-bold text-gray-900">PhonePe Online Gateway</h4>
                <p className="mt-0.5 text-xs font-medium text-gray-500">Uses PhonePe Standard Checkout. Client Secret stays server-side and is masked after saving.</p>
              </div>
              <div className="flex items-center gap-3">
                <span className={`text-xs font-bold ${listingPaymentForm.phonepe.enabled ? 'text-emerald-700' : 'text-gray-500'}`}>
                  {listingPaymentForm.phonepe.enabled ? 'ENABLED' : 'DISABLED'}
                </span>
                <button
                  type="button"
                  role="switch"
                  aria-checked={listingPaymentForm.phonepe.enabled}
                  onClick={() => updateListingPaymentForm({ phonepe: { enabled: !listingPaymentForm.phonepe.enabled } })}
                  className={`relative inline-flex h-7 w-12 items-center rounded-full transition-colors ${listingPaymentForm.phonepe.enabled ? 'bg-emerald-500' : 'bg-gray-300'}`}
                >
                  <span className={`inline-block h-5 w-5 transform rounded-full bg-white shadow-md transition-transform ${listingPaymentForm.phonepe.enabled ? 'translate-x-6' : 'translate-x-1'}`} />
                </button>
              </div>
            </div>

            <div className="grid gap-5 md:grid-cols-2">
              <div className="rounded-xl border border-gray-200 bg-white px-4 py-3">
                <span className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-gray-700">Detected Mode</span>
                <span className={`inline-flex rounded-full px-3 py-1 text-xs font-bold ${
                  phonePeFieldsDisabled
                    ? 'bg-gray-100 text-gray-500'
                    : detectedPhonePeMode === 'LIVE'
                      ? 'bg-emerald-50 text-emerald-700'
                      : 'bg-blue-50 text-blue-700'
                }`}>
                  {phonePeFieldsDisabled ? 'Enable PhonePe first' : detectedPhonePeMode ? `${detectedPhonePeMode} Mode` : 'Not detected'}
                </span>
              </div>
              <SettingsInput
                label="Client ID"
                value={phonePeFieldsDisabled ? '' : listingPaymentForm.phonepe.clientId}
                onChange={(value) => updateListingPaymentForm({ phonepe: { clientId: value } })}
                disabled={phonePeFieldsDisabled}
                placeholder={phonePeFieldsDisabled ? 'Enable PhonePe to add Client ID' : 'PhonePe Client ID'}
              />
              <SettingsInput
                label="Client Secret"
                type="password"
                value={phonePeFieldsDisabled ? '' : listingPaymentForm.phonepe.clientSecret}
                onChange={(value) => updateListingPaymentForm({ phonepe: { clientSecret: value } })}
                disabled={phonePeFieldsDisabled}
                placeholder={phonePeFieldsDisabled ? 'Enable PhonePe to add secret' : 'Leave masked value to keep existing secret'}
              />
              <SettingsInput
                label="Client Version"
                value={phonePeFieldsDisabled ? '' : listingPaymentForm.phonepe.clientVersion}
                onChange={(value) => updateListingPaymentForm({ phonepe: { clientVersion: value } })}
                disabled={phonePeFieldsDisabled}
                placeholder="Usually 1"
              />
            </div>
          </div>

          <div className="flex justify-end border-t border-gray-100 pt-4">
            <button
              type="submit"
              disabled={listingPaymentSaving}
              className="inline-flex items-center gap-2 rounded-xl bg-[#FFC107] px-6 py-3 text-sm font-bold text-black shadow-sm transition hover:bg-[#E5AD06] disabled:cursor-not-allowed disabled:opacity-60"
            >
              <Save className="h-4 w-4" />
              {listingPaymentSaving ? 'Saving...' : 'Save Buy Now Payment Settings'}
            </button>
          </div>
        </form>
      </section>

      <section className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
        <div className="mb-5 flex items-center justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-gray-500">Submitted Receipts</p>
            <h3 className="mt-1 text-xl font-bold text-gray-900">Listing Payment Verification</h3>
          </div>
          <button
            type="button"
            onClick={() => void loadListingPayments()}
            className="inline-flex items-center gap-2 rounded-lg border border-gray-200 px-3 py-2 text-xs font-semibold text-gray-700 transition hover:bg-gray-50"
          >
            <RefreshCcw className="h-3.5 w-3.5" />
            Refresh
          </button>
        </div>

        <div className="overflow-x-auto rounded-xl border border-gray-200">
          <table className="min-w-full divide-y divide-gray-200 text-sm">
            <thead className="bg-gray-50 text-xs uppercase tracking-wider text-gray-500">
              <tr>
                <th className="px-4 py-3 text-left font-bold">Listing</th>
                <th className="px-4 py-3 text-left font-bold">Buyer</th>
                <th className="px-4 py-3 text-left font-bold">Partner</th>
                <th className="px-4 py-3 text-left font-bold">Payment</th>
                <th className="px-4 py-3 text-left font-bold">Status</th>
                <th className="px-4 py-3 text-right font-bold">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 bg-white">
              {listingPaymentsLoading ? (
                <tr>
                  <td colSpan={6} className="px-4 py-8"><BrandLoader variant="inline" size="sm" bg="light" text="Loading receipts..." /></td>
                </tr>
              ) : listingPayments.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-sm text-gray-500">No listing payment receipts submitted yet.</td>
                </tr>
              ) : (
                listingPayments.map((payment) => {
                  const receiptUrl = getAbsoluteFileUrl(payment.receiptUrl);
                  const statusApproved = payment.status === 'APPROVED' || payment.status === 'PAID';
                  const statusRejected = payment.status === 'REJECTED' || payment.status === 'FAILED';

                  return (
                    <tr key={payment.id} className="align-top">
                      <td className="px-4 py-4">
                        <p className="font-bold text-gray-900">{payment.listing?.title || 'Listing'}</p>
                        <p className="mt-1 text-xs text-gray-500">{payment.submittedAt ? new Intl.DateTimeFormat('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }).format(new Date(payment.submittedAt)) : '-'}</p>
                      </td>
                      <td className="px-4 py-4">
                        <p className="font-semibold text-gray-900">{payment.buyer?.name || 'Customer'}</p>
                        <p className="mt-1 text-xs text-gray-500">{payment.buyer?.mobile || payment.buyer?.email || '-'}</p>
                      </td>
                      <td className="px-4 py-4">
                        <p className="font-semibold text-gray-900">{payment.partner?.name || 'Partner'}</p>
                        <p className="mt-1 text-xs text-gray-500">{payment.partner?.mobile || payment.partner?.email || '-'}</p>
                      </td>
                      <td className="px-4 py-4">
                        <div className="flex items-center gap-2">
                          <CreditCard className="h-4 w-4 text-amber-600" />
                          <span className="font-bold text-gray-900">₹{payment.amount.toLocaleString('en-IN')}</span>
                        </div>
                        <p className="mt-1 text-xs text-gray-500">
                          {payment.method}{payment.transactionRef ? ` · ${payment.transactionRef}` : ''}
                        </p>
                        {payment.paymentNote ? (
                          <p className="mt-2 max-w-xs rounded-lg bg-gray-50 px-3 py-2 text-xs text-gray-600">{payment.paymentNote}</p>
                        ) : null}
                      </td>
                      <td className="px-4 py-4">
                        <span className={`inline-flex items-center gap-1 rounded-full border px-3 py-1 text-xs font-bold ${
                          statusApproved
                            ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                            : statusRejected
                              ? 'border-red-200 bg-red-50 text-red-700'
                              : 'border-gray-200 bg-gray-50 text-gray-700'
                        }`}>
                          {statusApproved ? <CheckCircle2 className="h-3.5 w-3.5" /> : null}
                          {statusRejected ? <XCircle className="h-3.5 w-3.5" /> : null}
                          {payment.status.replace(/_/g, ' ')}
                        </span>
                        {payment.rejectionReason ? (
                          <p className="mt-2 max-w-xs text-xs text-red-600">{payment.rejectionReason}</p>
                        ) : null}
                      </td>
                      <td className="px-4 py-4 text-right">
                        <div className="flex flex-col items-end gap-2">
                          {receiptUrl ? (
                            <a
                              href={receiptUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-2 rounded-lg border border-gray-200 px-3 py-2 text-xs font-bold text-gray-700 transition hover:border-amber-300 hover:bg-amber-50 hover:text-amber-800"
                            >
                              View receipt
                              <ExternalLink className="h-3.5 w-3.5" />
                            </a>
                          ) : null}
                          <div className="flex gap-2">
                            <button
                              type="button"
                              onClick={() => void handleListingPaymentStatus(payment.id, 'APPROVED')}
                              className="inline-flex items-center gap-1 rounded-lg border border-emerald-200 px-3 py-2 text-xs font-bold text-emerald-700 transition hover:bg-emerald-50"
                            >
                              <CheckCircle2 className="h-3.5 w-3.5" />
                              Approve
                            </button>
                            <button
                              type="button"
                              onClick={() => void handleListingPaymentStatus(payment.id, 'REJECTED')}
                              className="inline-flex items-center gap-1 rounded-lg border border-red-200 px-3 py-2 text-xs font-bold text-red-600 transition hover:bg-red-50"
                            >
                              <XCircle className="h-3.5 w-3.5" />
                              Reject
                            </button>
                          </div>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
