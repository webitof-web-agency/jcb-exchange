"use client";
/* eslint-disable @next/next/no-img-element */

import { useEffect, useMemo, useState } from 'react';
import axios from 'axios';
import { Loader2, QrCode, Receipt, Upload, X } from 'lucide-react';
import api from '@/lib/api';
import { getAbsoluteFileUrl, uploadCustomerPrimeReceiptToServer } from '@/lib/fileUpload';
import { useAuthStore, type AuthUser } from '@/store/authStore';
import { useTranslation } from '@/hooks/useTranslation';

type CustomerPrimeFeature = 'CALL' | 'WHATSAPP' | 'SELL_LISTING';

type PrimeAccessPayload = {
  settings: {
    enabled: boolean;
    upiId: string | null;
    amount: number | null;
    validityValue: number | null;
    validityUnit: 'DAYS' | 'MONTHS';
  };
  gatingEnabled: boolean;
  qrPaymentUri: string | null;
  hasActiveSubscription: boolean;
  isPrimeCustomer: boolean;
  customerCategory: string;
  activeSubscription: {
    id: string;
    expiresAt: string | null;
  } | null;
  pendingSubscription: {
    id: string;
    submittedAt: string;
    receiptUrl?: string | null;
  } | null;
};

type AccessResponse = {
  access: PrimeAccessPayload;
};

type SubmitResponse = {
  message: string;
  subscription: {
    id: string;
    status: 'PENDING' | 'ACTIVE' | 'REJECTED' | 'EXPIRED' | 'CANCELLED';
    expiresAt?: string | null;
    submittedAt?: string;
    receiptUrl?: string | null;
  } | null;
  user?: AuthUser;
};

const formatAmount = (amount?: number | null) =>
  new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0,
  }).format(amount || 0);

const formatValidity = (value?: number | null, unit?: 'DAYS' | 'MONTHS') => {
  if (!value) {
    return 'Not configured';
  }

  return `${value} ${unit === 'MONTHS' ? (value === 1 ? 'month' : 'months') : value === 1 ? 'day' : 'days'}`;
};

const getApiErrorMessage = (error: unknown, fallbackMessage: string) => {
  if (axios.isAxiosError(error)) {
    return error.response?.data?.error || fallbackMessage;
  }

  return error instanceof Error ? error.message : fallbackMessage;
};

export default function CustomerPrimePaymentModal({
  isOpen,
  feature,
  onClose,
  onAccessGranted,
}: {
  isOpen: boolean;
  feature: CustomerPrimeFeature;
  onClose: () => void;
  onAccessGranted: () => void;
}) {
  const { t } = useTranslation();
  const { user, token, setAuth } = useAuthStore();
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [uploadingReceipt, setUploadingReceipt] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [access, setAccess] = useState<PrimeAccessPayload | null>(null);
  const [receiptUrl, setReceiptUrl] = useState<string | null>(null);
  const [receiptName, setReceiptName] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen || !user?.id) {
      return;
    }

    let isMounted = true;

    const loadAccess = async () => {
      setLoading(true);
      setError(null);
      setMessage(null);

      try {
        const response = await api.get<AccessResponse>('/auth/customer-prime/access');
        if (isMounted) {
          setAccess(response.data.access);
          setReceiptUrl(response.data.access.pendingSubscription?.receiptUrl || null);
        }
      } catch (loadError) {
        if (isMounted) {
          setError(getApiErrorMessage(loadError, t('primeModal.loadFailed')));
        }
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    };

    void loadAccess();

    return () => {
      isMounted = false;
    };
  }, [isOpen, user?.id, t]);

  useEffect(() => {
    if (!isOpen || !user) {
      return;
    }

    const previousOverflow = document.body.style.overflow;
    const previousPaddingRight = document.body.style.paddingRight;
    const scrollbarWidth = window.innerWidth - document.documentElement.clientWidth;

    document.body.style.overflow = 'hidden';
    if (scrollbarWidth > 0) {
      document.body.style.paddingRight = `${scrollbarWidth}px`;
    }

    return () => {
      document.body.style.overflow = previousOverflow;
      document.body.style.paddingRight = previousPaddingRight;
    };
  }, [isOpen, user]);

  const featureDetails: { title: string; helper: string } = {
    CALL: {
      title: t('primeModal.features.call.title'),
      helper: t('primeModal.features.call.helper'),
    },
    WHATSAPP: {
      title: t('primeModal.features.whatsapp.title'),
      helper: t('primeModal.features.whatsapp.helper'),
    },
    SELL_LISTING: {
      title: t('primeModal.features.sellListing.title'),
      helper: t('primeModal.features.sellListing.helper'),
    },
  }[feature];
  const featureRequiresPrime = useMemo(() => access?.gatingEnabled ?? false, [access]);

  useEffect(() => {
    if (!isOpen || !access) {
      return;
    }

    if (!featureRequiresPrime || access.hasActiveSubscription) {
      onAccessGranted();
      onClose();
    }
  }, [access, featureRequiresPrime, isOpen, onAccessGranted, onClose]);

  const qrImageUrl = access?.qrPaymentUri
    ? `https://api.qrserver.com/v1/create-qr-code/?size=280x280&data=${encodeURIComponent(access.qrPaymentUri)}`
    : null;

  const handleReceiptUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = event.target.files?.[0];
    if (!selectedFile) {
      return;
    }

    setUploadingReceipt(true);
    setError(null);

    try {
      const uploadedFile = await uploadCustomerPrimeReceiptToServer(selectedFile);
      setReceiptUrl(uploadedFile.fileUrl);
      setReceiptName(uploadedFile.originalName);
      setMessage(t('primeModal.receiptUploaded'));
    } catch (uploadError) {
      setError(getApiErrorMessage(uploadError, t('primeModal.uploadFailed')));
    } finally {
      setUploadingReceipt(false);
      event.target.value = '';
    }
  };

  const handleSubmit = async () => {
    if (!receiptUrl) {
      setError(t('primeModal.receiptRequired'));
      return;
    }

    setSubmitting(true);
    setError(null);
    setMessage(null);

    try {
      const response = await api.post<SubmitResponse>('/auth/customer-prime/subscribe', {
        receiptUrl,
      });

      if (token && user && response.data.user) {
        setAuth(token, {
          ...user,
          ...response.data.user,
        });
      }

      setAccess((current) =>
        current
          ? {
            ...current,
            pendingSubscription: response.data.subscription
              ? {
                id: response.data.subscription.id,
                submittedAt: response.data.subscription.submittedAt || new Date().toISOString(),
                receiptUrl: response.data.subscription.receiptUrl || receiptUrl,
              }
              : current.pendingSubscription,
          }
          : current,
      );

      setMessage(response.data.message);

      setTimeout(() => {
        onClose();
      }, 1500);
    } catch (submitError) {
      setError(getApiErrorMessage(submitError, t('primeModal.submitFailed')));
    } finally {
      setSubmitting(false);
    }
  };

  if (!isOpen || !user) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-[120] flex items-start justify-center overflow-hidden bg-[rgba(8,10,15,0.72)] px-4 py-6">
      <div className="relative flex max-h-[calc(100vh-3rem)] w-full max-w-5xl flex-col overflow-hidden rounded-[28px] bg-white shadow-[0_30px_80px_-20px_rgba(0,0,0,0.35)] [isolation:isolate]">
        <button
          type="button"
          onClick={onClose}
          className="absolute right-4 top-4 z-20 rounded-full bg-white/90 p-2 text-gray-500 shadow-sm transition hover:text-gray-900"
        >
          <X className="h-5 w-5" />
        </button>

        <div className="grid min-h-0 flex-1 gap-0 lg:grid-cols-[1fr_1.08fr]">
          <div className="relative overflow-hidden bg-[#141414] px-5 py-6 sm:px-7 sm:py-8 text-white flex-shrink-0">
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(255,193,7,0.24),transparent_42%),radial-gradient(circle_at_bottom_right,rgba(255,255,255,0.08),transparent_32%)]" />
            <div className="relative">
              <h2 className="max-w-md text-2xl sm:text-3xl font-black leading-tight">{featureDetails.title}</h2>
              <div className="mt-3 sm:mt-4 max-w-md text-xs sm:text-sm leading-relaxed text-gray-300">
                <p className="mb-1 font-semibold text-white">{t('primeModal.featuresUnlocked')}</p>
                <ul className="list-inside list-disc space-y-0.5">
                  <li>{t('primeModal.unlocks.call')}</li>
                  <li>{t('primeModal.unlocks.whatsapp')}</li>
                  <li>{t('primeModal.unlocks.sellListing')}</li>
                </ul>
              </div>

              <div className="mt-5 sm:mt-8 grid gap-3 grid-cols-2">
                <div className="rounded-xl border border-white/10 bg-white/5 p-3 sm:p-4">
                  <div className="text-[10px] font-semibold uppercase tracking-[0.1em] text-gray-400">{t('primeModal.amount')}</div>
                  <div className="mt-1 text-lg sm:text-2xl font-black text-yellow-300">{formatAmount(access?.settings.amount)}</div>
                </div>
                <div className="rounded-xl border border-white/10 bg-white/5 p-3 sm:p-4">
                  <div className="text-[10px] font-semibold uppercase tracking-[0.1em] text-gray-400">{t('primeModal.validity')}</div>
                  <div className="mt-1 text-base sm:text-xl font-black text-white">
                    {formatValidity(access?.settings.validityValue, access?.settings.validityUnit)}
                  </div>
                </div>
              </div>

            </div>
          </div>

          <div className="min-h-0 overflow-y-auto bg-[#FBFBFA] px-7 py-8">
            {loading ? (
              <div className="flex min-h-[520px] items-center justify-center">
                <div className="h-10 w-10 animate-spin rounded-full border-4 border-[#FFC107] border-t-transparent" />
              </div>
            ) : !access ? (
              <div className="rounded-2xl border border-red-200 bg-red-50 px-5 py-4 text-sm text-red-700">{error}</div>
            ) : !access?.settings.upiId || !access?.settings.amount || !access?.settings.validityValue ? (
              <div className="rounded-2xl border border-amber-200 bg-amber-50 px-5 py-4 text-sm text-amber-800">
                {t('primeModal.settingsIncomplete')}
              </div>
            ) : access.pendingSubscription ? (
              <div className="space-y-5">
                <div className="rounded-2xl border border-amber-200 bg-amber-50 px-5 py-4 text-sm text-amber-800">
                  <p className="font-semibold mb-1">{t('primeModal.paymentSubmittedTitle')}</p>
                  {t('primeModal.paymentSubmittedDescription')}
                </div>
                <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
                  <div className="text-sm font-semibold text-gray-900">{t('primeModal.submittedAt')}</div>
                  <div className="mt-1 text-sm text-gray-600">
                    {new Date(access.pendingSubscription.submittedAt).toLocaleString('en-IN')}
                  </div>
                  {access.pendingSubscription.receiptUrl ? (
                    <a
                      href={getAbsoluteFileUrl(access.pendingSubscription.receiptUrl)}
                      target="_blank"
                      rel="noreferrer"
                      className="mt-4 inline-flex items-center gap-2 rounded-lg border border-gray-200 px-4 py-2 text-sm font-semibold text-gray-800 transition hover:bg-gray-50"
                    >
                      <Receipt className="h-4 w-4" />
                      {t('primeModal.viewUploadedReceipt')}
                    </a>
                  ) : null}
                </div>
              </div>
            ) : (
              <div className="space-y-5">
                {error ? (
                  <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
                ) : null}

                <div className="rounded-[26px] border border-gray-200 bg-white p-5 shadow-sm">
                  <div className="flex items-center gap-2 text-sm font-semibold text-gray-500">
                    <QrCode className="h-4 w-4 text-[#9A7600]" />
                    Scan and pay to the configured UPI ID
                  </div>
                  <div className="mt-4 flex flex-col items-center justify-center gap-4">
                    {qrImageUrl ? (
                      <img
                        src={qrImageUrl}
                        alt="Prime payment QR code"
                        className="h-64 w-64 rounded-2xl border border-gray-200 bg-white p-3 shadow-sm"
                      />
                    ) : null}
                    <div className="text-center">
                      <div className="text-xs font-semibold uppercase tracking-[0.2em] text-gray-500">UPI ID</div>
                      <div className="mt-1 text-lg font-black text-gray-900">{access.settings.upiId}</div>
                    </div>
                  </div>
                </div>

                <div className="rounded-[26px] border border-gray-200 bg-white p-5 shadow-sm">
                  <div className="space-y-4">
                    <div>
                      <label className="mb-2 block text-sm font-semibold text-gray-800">{t('primeModal.uploadPaymentReceipt')}</label>
                      <label className="flex cursor-pointer items-center justify-between rounded-xl border border-dashed border-gray-300 bg-gray-50 px-4 py-4 transition hover:border-[#FFC107] hover:bg-yellow-50/30">
                        <div className="flex items-center gap-3">
                          {uploadingReceipt ? (
                            <Loader2 className="h-5 w-5 animate-spin text-[#9A7600]" />
                          ) : (
                            <Upload className="h-5 w-5 text-[#9A7600]" />
                          )}
                          <div>
                            <div className="text-sm font-semibold text-gray-900">
                              {uploadingReceipt ? t('primeModal.uploadingReceipt') : receiptName || t('primeModal.chooseReceipt')}
                            </div>
                            <div className="text-xs text-gray-500">{t('primeModal.supportedFormats')}</div>
                          </div>
                        </div>
                        <input type="file" accept=".jpg,.jpeg,.png,.webp,.pdf" className="hidden" onChange={(event) => void handleReceiptUpload(event)} />
                      </label>
                    </div>
                  </div>
                </div>

                {message ? (
                  <div className="rounded-2xl border border-sky-200 bg-sky-50 px-4 py-3 text-sm text-sky-700">{message}</div>
                ) : null}

                <div className="rounded-[26px] border border-gray-200 bg-white p-5 shadow-sm">
                  <button
                    type="button"
                    onClick={() => void handleSubmit()}
                    disabled={submitting || uploadingReceipt || !receiptUrl}
                    className="inline-flex w-full items-center justify-center rounded-xl bg-[#111827] px-5 py-3 text-sm font-bold text-white transition hover:bg-black disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {submitting ? t('primeModal.submitting') : t('primeModal.submitForApproval')}
                  </button>
                  <p className="mt-3 text-center text-xs leading-5 text-gray-500">
                    {t('primeModal.approvalNote')}
                  </p>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export type { CustomerPrimeFeature };
