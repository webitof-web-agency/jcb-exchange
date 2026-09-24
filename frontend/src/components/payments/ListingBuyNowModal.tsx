"use client";

import { useEffect, useMemo, useState } from 'react';
import axios from 'axios';
import {
  AlertCircle,
  Building2,
  Check,
  CheckCircle2,
  Clock,
  Copy,
  CreditCard,
  Eye,
  FileText,
  Info,
  Loader2,
  ShieldCheck,
  Smartphone,
  Trash2,
  UploadCloud,
  X,
} from 'lucide-react';
import { toast } from 'react-toastify';
import api from '@/lib/api';
import { uploadListingPaymentReceiptToServer } from '@/lib/fileUpload';
import { useToastStore } from '@/store/toastStore';
import BrandLoader from '@/components/ui/BrandLoader';
import ReceiptPreviewModal from '@/components/payments/ReceiptPreviewModal';

type ListingPaymentSettings = {
  rtgs: {
    enabled: boolean;
    beneficiaryName: string | null;
    bankName: string | null;
    accountNumber: string | null;
    ifscCode: string | null;
    branchName: string | null;
    instructions: string | null;
  };
  razorpay: {
    enabled: boolean;
    keyId: string | null;
    mode: 'TEST' | 'LIVE';
  };
  phonepe: {
    enabled: boolean;
    mode: 'TEST' | 'LIVE';
  };
};

type PaymentSubmissionRecord = {
  id: string;
  method: string;
  status: string;
  amount: number;
  transactionRef: string | null;
  receiptUrl: string | null;
  paymentNote: string | null;
  submittedAt: string;
};

type PaymentSettingsResponse = {
  success: boolean;
  listing: {
    id: string;
    title: string;
    amount: number;
  };
  paymentSettings: ListingPaymentSettings;
  existingSubmission?: PaymentSubmissionRecord | null;
};

type RazorpayOrderResponse = {
  success: boolean;
  order: {
    id: string;
    amount: number;
    currency: string;
    keyId: string;
    listingTitle: string;
  };
};

type RazorpaySuccessResponse = {
  razorpay_order_id: string;
  razorpay_payment_id: string;
  razorpay_signature: string;
};

type PhonePeOrderResponse = {
  success: boolean;
  order: {
    merchantOrderId: string;
    orderId: string | null;
    amount: number;
    currency: string;
    redirectUrl: string;
    listingTitle: string;
  };
};

type RazorpayOptions = {
  key: string;
  amount: number;
  currency: string;
  name: string;
  description: string;
  order_id: string;
  handler: (response: RazorpaySuccessResponse) => void;
  prefill?: {
    name?: string | null;
    email?: string | null;
    contact?: string | null;
  };
  notes?: Record<string, string>;
  theme?: {
    color?: string;
  };
  modal?: {
    ondismiss?: () => void;
  };
};

type RazorpayInstance = {
  open: () => void;
};

declare global {
  interface Window {
    Razorpay?: new (options: RazorpayOptions) => RazorpayInstance;
  }
}

const formatCurrency = (amount?: number | null) =>
  new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0,
  }).format(amount || 0);

const formatDate = (dateString?: string | null) => {
  if (!dateString) return '';
  try {
    return new Date(dateString).toLocaleString('en-IN', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hour12: true,
    });
  } catch {
    return dateString;
  }
};

const getApiErrorMessage = (error: unknown, fallbackMessage: string) => {
  if (axios.isAxiosError(error)) {
    return error.response?.data?.error || fallbackMessage;
  }

  return error instanceof Error ? error.message : fallbackMessage;
};

const loadRazorpayScript = () =>
  new Promise<boolean>((resolve) => {
    if (typeof window === 'undefined') {
      resolve(false);
      return;
    }

    if (window.Razorpay) {
      resolve(true);
      return;
    }

    const script = document.createElement('script');
    script.src = 'https://checkout.razorpay.com/v1/checkout.js';
    script.onload = () => resolve(true);
    script.onerror = () => resolve(false);
    document.body.appendChild(script);
  });

export default function ListingBuyNowModal({
  isOpen,
  listingId,
  fallbackTitle,
  fallbackAmount,
  buyer,
  onClose,
}: {
  isOpen: boolean;
  listingId: string;
  fallbackTitle: string;
  fallbackAmount: number;
  buyer?: {
    name?: string | null;
    email?: string | null;
    mobile?: string | null;
  } | null;
  onClose: () => void;
}) {
  const { showToast } = useToastStore();
  const [loading, setLoading] = useState(false);
  const [settings, setSettings] = useState<ListingPaymentSettings | null>(null);
  const [existingSubmission, setExistingSubmission] = useState<PaymentSubmissionRecord | null>(null);
  const [title, setTitle] = useState(fallbackTitle);
  const [amount, setAmount] = useState(fallbackAmount);
  const [activeMethod, setActiveMethod] = useState<'RTGS' | 'RAZORPAY' | 'PHONEPE'>('RTGS');
  const [transactionRef, setTransactionRef] = useState('');
  const [paymentNote, setPaymentNote] = useState('');
  const [receiptUrl, setReceiptUrl] = useState<string | null>(null);
  const [receiptName, setReceiptName] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copiedField, setCopiedField] = useState<string | null>(null);
  const [viewingReceiptUrl, setViewingReceiptUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    let mounted = true;

    const loadSettings = async () => {
      setLoading(true);
      setError(null);
      setMessage(null);

      try {
        const response = await api.get<PaymentSettingsResponse>(`/listings/${listingId}/payment-settings`);
        if (!mounted) return;

        setSettings(response.data.paymentSettings);
        setTitle(response.data.listing.title || fallbackTitle);
        setAmount(response.data.listing.amount || fallbackAmount);
        setExistingSubmission(response.data.existingSubmission || null);

        if (response.data.paymentSettings.rtgs.enabled) {
          setActiveMethod('RTGS');
        } else if (response.data.paymentSettings.razorpay.enabled) {
          setActiveMethod('RAZORPAY');
        } else if (response.data.paymentSettings.phonepe.enabled) {
          setActiveMethod('PHONEPE');
        }
      } catch (loadError) {
        if (mounted) {
          const errMsg = getApiErrorMessage(loadError, 'Unable to load payment details.');
          setError(errMsg);
        }
      } finally {
        if (mounted) {
          setLoading(false);
        }
      }
    };

    void loadSettings();

    return () => {
      mounted = false;
    };
  }, [fallbackAmount, fallbackTitle, isOpen, listingId]);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [isOpen]);

  const enabledMethods = useMemo(
    () => ({
      rtgs: settings?.rtgs.enabled === true,
      razorpay: settings?.razorpay.enabled === true && !!settings?.razorpay.keyId,
      phonepe: settings?.phonepe.enabled === true,
    }),
    [settings],
  );

  const copyToClipboard = (text: string | null | undefined, label: string) => {
    if (!text) return;
    void navigator.clipboard.writeText(text);
    setCopiedField(label);

    const msg = `${label} copied to clipboard!`;
    toast.success(msg);
    showToast({
      title: 'Copied to Clipboard',
      description: `${label} (${text}) copied.`,
      variant: 'success',
    });

    setTimeout(() => {
      setCopiedField(null);
    }, 2000);
  };

  const handleReceiptUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = event.target.files?.[0];
    if (!selectedFile) {
      return;
    }

    setUploading(true);
    setError(null);

    try {
      const uploadedFile = await uploadListingPaymentReceiptToServer(selectedFile);
      setReceiptUrl(uploadedFile.fileUrl);
      setReceiptName(uploadedFile.originalName);
      setMessage('Receipt compressed & uploaded successfully. Enter UTR number and click submit.');

      toast.success('Payment receipt compressed & uploaded successfully!');
      showToast({
        title: 'Receipt Uploaded',
        description: 'Payment receipt compressed and uploaded successfully.',
        variant: 'success',
      });
    } catch (uploadError) {
      const errMsg = getApiErrorMessage(uploadError, 'Unable to upload receipt.');
      setError(errMsg);
      toast.error(errMsg);
      showToast({
        title: 'Upload Failed',
        description: errMsg,
        variant: 'error',
      });
    } finally {
      setUploading(false);
      event.target.value = '';
    }
  };

  const handleRtgsSubmit = async () => {
    if (!transactionRef.trim() || !receiptUrl) {
      const errMsg = 'UTR / Reference number and receipt upload are required.';
      setError(errMsg);
      toast.error(errMsg);
      showToast({
        title: 'Validation Error',
        description: errMsg,
        variant: 'error',
      });
      return;
    }

    setSubmitting(true);
    setError(null);
    setMessage(null);

    try {
      const response = await api.post<{ message: string; payment: PaymentSubmissionRecord }>(
        `/listings/${listingId}/payment-submissions`,
        {
          method: 'RTGS',
          transactionRef,
          receiptUrl,
          paymentNote,
        },
      );
      const successMsg = response.data.message || 'Payment proof submitted successfully for verification.';
      setMessage(successMsg);
      toast.success(successMsg);
      showToast({
        title: 'Payment Proof Submitted',
        description: successMsg,
        variant: 'success',
      });

      if (response.data.payment) {
        setExistingSubmission(response.data.payment);
      } else {
        setExistingSubmission({
          id: `${Date.now()}`,
          method: 'RTGS',
          status: 'PENDING_VERIFICATION',
          amount,
          transactionRef,
          receiptUrl,
          paymentNote,
          submittedAt: new Date().toISOString(),
        });
      }
    } catch (submitError) {
      const errMsg = getApiErrorMessage(submitError, 'Unable to submit payment proof.');
      setError(errMsg);
      toast.error(errMsg);
      showToast({
        title: 'Submission Failed',
        description: errMsg,
        variant: 'error',
      });
    } finally {
      setSubmitting(false);
    }
  };

  const handleRazorpayPayment = async () => {
    setSubmitting(true);
    setError(null);
    setMessage(null);

    try {
      const scriptLoaded = await loadRazorpayScript();
      if (!scriptLoaded || !window.Razorpay) {
        const errMsg = 'Unable to load Razorpay checkout SDK.';
        setError(errMsg);
        toast.error(errMsg);
        showToast({ title: 'Error', description: errMsg, variant: 'error' });
        return;
      }

      const orderResponse = await api.post<RazorpayOrderResponse>(`/listings/${listingId}/razorpay-order`);
      const order = orderResponse.data.order;

      const checkout = new window.Razorpay({
        key: order.keyId,
        amount: order.amount,
        currency: order.currency,
        name: 'JCB Exchange',
        description: order.listingTitle,
        order_id: order.id,
        prefill: {
          name: buyer?.name,
          email: buyer?.email,
          contact: buyer?.mobile,
        },
        notes: {
          listingId,
        },
        theme: {
          color: '#FFC107',
        },
        modal: {
          ondismiss: () => {
            setSubmitting(false);
          },
        },
        handler: (razorpayResponse) => {
          void api
            .post<{ message: string; payment: PaymentSubmissionRecord }>(`/listings/${listingId}/payment-submissions`, {
              method: 'RAZORPAY',
              razorpayOrderId: razorpayResponse.razorpay_order_id,
              razorpayPaymentId: razorpayResponse.razorpay_payment_id,
              razorpaySignature: razorpayResponse.razorpay_signature,
            })
            .then((submitResponse) => {
              const msg = submitResponse.data.message || 'Payment successful!';
              setMessage(msg);
              toast.success(msg);
              showToast({ title: 'Payment Success', description: msg, variant: 'success' });
              if (submitResponse.data.payment) {
                setExistingSubmission(submitResponse.data.payment);
              }
            })
            .catch((submitError) => {
              const errMsg = getApiErrorMessage(submitError, 'Payment succeeded but verification failed.');
              setError(errMsg);
              toast.error(errMsg);
              showToast({ title: 'Verification Failed', description: errMsg, variant: 'error' });
            })
            .finally(() => {
              setSubmitting(false);
            });
        },
      });

      checkout.open();
    } catch (paymentError) {
      const errMsg = getApiErrorMessage(paymentError, 'Unable to start Razorpay payment.');
      setError(errMsg);
      toast.error(errMsg);
      showToast({ title: 'Payment Failed', description: errMsg, variant: 'error' });
      setSubmitting(false);
    }
  };

  const handlePhonePePayment = async () => {
    setSubmitting(true);
    setError(null);
    setMessage(null);

    try {
      const orderResponse = await api.post<PhonePeOrderResponse>(`/listings/${listingId}/phonepe-order`);
      window.location.href = orderResponse.data.order.redirectUrl;
    } catch (paymentError) {
      const errMsg = getApiErrorMessage(paymentError, 'Unable to start PhonePe payment.');
      setError(errMsg);
      toast.error(errMsg);
      showToast({ title: 'PhonePe Error', description: errMsg, variant: 'error' });
      setSubmitting(false);
    }
  };

  if (!isOpen) {
    return null;
  }

  return (
    <>
      <div className="fixed inset-0 z-[100] flex items-center justify-center overflow-hidden bg-black/60 px-3 py-4 sm:px-4 backdrop-blur-xs transition-all">
        <div className="relative my-auto w-full max-w-xl sm:max-w-2xl overflow-hidden rounded-2xl bg-white shadow-2xl ring-1 ring-black/5 animate-in fade-in zoom-in-95 duration-150">
          
          {/* Header Bar */}
          <div className="relative border-b border-gray-100 bg-white px-5 py-4 pr-12 sm:px-6 sm:py-5">
            <button
              type="button"
              onClick={onClose}
              className="absolute right-4 top-4 flex h-8 w-8 items-center justify-center rounded-full bg-gray-100 text-gray-500 transition-all hover:bg-gray-200 hover:text-gray-900"
              aria-label="Close modal"
            >
              <X className="h-4 w-4" />
            </button>

            <div className="flex items-center gap-2">
              <span className="inline-flex items-center gap-1 rounded-md bg-[#FFF8E1] px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-[#B78103] border border-[#FFE082]">
                <ShieldCheck className="h-3 w-3 text-[#D97706]" />
                BUY NOW
              </span>
            </div>

            <h2 className="mt-1.5 text-base font-bold text-gray-900 sm:text-lg">{title}</h2>

            <div className="mt-2 flex items-center gap-2">
              <span className="text-xs font-medium text-gray-500">Amount Payable:</span>
              <span className="rounded-md bg-[#FFC107] px-2.5 py-0.5 text-sm font-extrabold text-black shadow-2xs">
                {formatCurrency(amount)}
              </span>
            </div>
          </div>

          {/* Modal Body - Scrollbar Hidden */}
          <div className="max-h-[78vh] overflow-y-auto p-4 sm:p-6 [&::-webkit-scrollbar]:hidden [scrollbar-width:none] [-ms-overflow-style:none]">
            {loading ? (
              <div className="flex min-h-[240px] flex-col items-center justify-center gap-2">
                <BrandLoader size="md" variant="section" bg="light" text="Loading payment details..." />
              </div>
            ) : error && !settings ? (
              <div className="flex items-start gap-2.5 rounded-xl border border-red-200 bg-red-50 p-3.5 text-xs text-red-800">
                <AlertCircle className="h-4 w-4 shrink-0 text-red-600 mt-0.5" />
                <div>
                  <p className="font-semibold text-red-950">Unable to load details</p>
                  <p className="mt-0.5 text-red-700">{error}</p>
                </div>
              </div>
            ) : existingSubmission ? (
              /* EXISTING PAYMENT SUBMISSION STATUS CARD (INDUSTRY STANDARD) */
              <div className="space-y-4 animate-in fade-in duration-200">
                <div className="rounded-2xl border border-amber-200/80 bg-[#FFFBEB]/70 p-5 shadow-xs">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className="flex h-9 w-9 items-center justify-center rounded-full bg-amber-100 text-amber-700">
                        <Clock className="h-5 w-5 animate-pulse" />
                      </div>
                      <div>
                        <h3 className="text-sm font-extrabold text-gray-900">Payment Verification Under Review</h3>
                        <p className="text-[11px] font-medium text-gray-600">Submission Date: {formatDate(existingSubmission.submittedAt)}</p>
                      </div>
                    </div>
                    <span className="rounded-full bg-amber-100 border border-amber-300 px-3 py-1 text-xs font-black uppercase text-amber-900 tracking-wider">
                      {existingSubmission.status === 'PAID' ? '✓ PAID' : '⏳ UNDER REVIEW'}
                    </span>
                  </div>

                  <div className="mt-4 grid gap-3 border-t border-amber-200/70 pt-4 sm:grid-cols-2">
                    <div className="rounded-xl border border-gray-200 bg-white p-3">
                      <span className="text-[10px] font-bold uppercase tracking-wider text-gray-500">Method</span>
                      <p className="mt-0.5 text-xs font-bold text-gray-900">{existingSubmission.method}</p>
                    </div>

                    <div className="rounded-xl border border-gray-200 bg-white p-3">
                      <span className="text-[10px] font-bold uppercase tracking-wider text-gray-500">UTR / Reference No</span>
                      <div className="mt-0.5 flex items-center justify-between">
                        <p className="font-mono text-xs font-bold text-gray-900">{existingSubmission.transactionRef || 'N/A'}</p>
                        {existingSubmission.transactionRef ? (
                          <button
                            type="button"
                            onClick={() => copyToClipboard(existingSubmission.transactionRef, 'UTR Reference')}
                            className="flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[10px] font-bold text-amber-800 bg-amber-50 hover:bg-amber-100 border border-amber-200/70 transition-colors"
                          >
                            <Copy className="h-3 w-3 text-amber-700" />
                            <span>Copy</span>
                          </button>
                        ) : null}
                      </div>
                    </div>
                  </div>

                  {existingSubmission.receiptUrl ? (
                    <div className="mt-3 flex items-center justify-between rounded-xl border border-emerald-200 bg-emerald-50/80 p-3">
                      <div className="flex items-center gap-2 overflow-hidden">
                        <FileText className="h-4 w-4 text-emerald-700 shrink-0" />
                        <span className="text-xs font-semibold text-emerald-950 truncate">Uploaded Payment Receipt</span>
                      </div>
                      <button
                        type="button"
                        onClick={() => setViewingReceiptUrl(existingSubmission.receiptUrl)}
                        className="inline-flex items-center gap-1 rounded-lg bg-emerald-600 px-3 py-1 text-xs font-bold text-white hover:bg-emerald-700 transition-colors shrink-0"
                      >
                        <Eye className="h-3.5 w-3.5" />
                        View Receipt
                      </button>
                    </div>
                  ) : null}

                  {existingSubmission.paymentNote ? (
                    <div className="mt-3 rounded-xl border border-gray-200 bg-white p-3 text-xs">
                      <span className="font-bold text-gray-700">Payment Note:</span>
                      <p className="mt-0.5 text-gray-600">{existingSubmission.paymentNote}</p>
                    </div>
                  ) : null}
                </div>

                <div className="flex items-start gap-2.5 rounded-xl border border-blue-200 bg-blue-50/70 p-4 text-xs text-blue-900">
                  <Info className="h-4 w-4 shrink-0 text-blue-600 mt-0.5" />
                  <div className="space-y-0.5">
                    <p className="font-bold text-blue-950">Duplicate Submissions Restricted</p>
                    <p className="text-blue-800 leading-relaxed">
                      You have already submitted a payment proof for this machine. Our finance team is reviewing your transaction. You will be notified as soon as verification is complete.
                    </p>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={onClose}
                  className="w-full rounded-xl bg-gray-900 py-3 text-xs font-bold text-white shadow-xs transition-all hover:bg-black"
                >
                  Close Window
                </button>
              </div>
            ) : !enabledMethods.rtgs && !enabledMethods.razorpay && !enabledMethods.phonepe ? (
              <div className="flex items-start gap-2.5 rounded-xl border border-amber-200 bg-[#FFFBEB] p-4 text-xs text-amber-900">
                <Info className="h-4 w-4 shrink-0 text-amber-600 mt-0.5" />
                <div>
                  <p className="font-semibold">Online Payment Pending Configuration</p>
                  <p className="mt-0.5 text-amber-800">
                    Online purchase options are not active for this listing yet. Please contact support.
                  </p>
                </div>
              </div>
            ) : (
              <div className="space-y-5">
                
                {/* Payment Method Selector Tabs */}
                <div>
                  <label className="mb-2 block text-[11px] font-bold uppercase tracking-wider text-gray-500">Select Payment Method</label>
                  <div className="grid gap-2.5 sm:grid-cols-3">
                    {enabledMethods.rtgs ? (
                      <button
                        type="button"
                        onClick={() => {
                          setActiveMethod('RTGS');
                          setError(null);
                        }}
                        className={`relative flex flex-col items-center justify-center gap-0.5 rounded-xl border-2 p-3 transition-all ${
                          activeMethod === 'RTGS'
                            ? 'border-[#FFC107] bg-[#FFFBEB] text-black ring-1 ring-[#FFC107]/40'
                            : 'border-gray-200 bg-white text-gray-700 hover:border-gray-300 hover:bg-gray-50'
                        }`}
                      >
                        <div className="flex items-center gap-1.5">
                          <Building2 className={`h-4 w-4 ${activeMethod === 'RTGS' ? 'text-amber-700' : 'text-gray-500'}`} />
                          <span className="text-xs font-bold">Bank Transfer</span>
                        </div>
                        <span className="text-[10px] font-medium text-gray-500">RTGS / NEFT / IMPS</span>
                      </button>
                    ) : null}

                    {enabledMethods.razorpay ? (
                      <button
                        type="button"
                        onClick={() => {
                          setActiveMethod('RAZORPAY');
                          setError(null);
                        }}
                        className={`relative flex flex-col items-center justify-center gap-0.5 rounded-xl border-2 p-3 transition-all ${
                          activeMethod === 'RAZORPAY'
                            ? 'border-[#FFC107] bg-[#FFFBEB] text-black ring-1 ring-[#FFC107]/40'
                            : 'border-gray-200 bg-white text-gray-700 hover:border-gray-300 hover:bg-gray-50'
                        }`}
                      >
                        <div className="flex items-center gap-1.5">
                          <CreditCard className={`h-4 w-4 ${activeMethod === 'RAZORPAY' ? 'text-sky-600' : 'text-gray-500'}`} />
                          <span className="text-xs font-bold">Razorpay</span>
                        </div>
                        <span className="text-[10px] font-medium text-gray-500">Cards / NetBanking</span>
                      </button>
                    ) : null}

                    {enabledMethods.phonepe ? (
                      <button
                        type="button"
                        onClick={() => {
                          setActiveMethod('PHONEPE');
                          setError(null);
                        }}
                        className={`relative flex flex-col items-center justify-center gap-0.5 rounded-xl border-2 p-3 transition-all ${
                          activeMethod === 'PHONEPE'
                            ? 'border-[#FFC107] bg-[#FFFBEB] text-black ring-1 ring-[#FFC107]/40'
                            : 'border-gray-200 bg-white text-gray-700 hover:border-gray-300 hover:bg-gray-50'
                        }`}
                      >
                        <div className="flex items-center gap-1.5">
                          <Smartphone className={`h-4 w-4 ${activeMethod === 'PHONEPE' ? 'text-purple-600' : 'text-gray-500'}`} />
                          <span className="text-xs font-bold">PhonePe</span>
                        </div>
                        <span className="text-[10px] font-medium text-gray-500">UPI / QR Code</span>
                      </button>
                    ) : null}
                  </div>
                </div>

                {/* Status Alerts */}
                {error ? (
                  <div className="flex items-start gap-2.5 rounded-xl border border-red-200 bg-red-50 p-3.5 text-xs text-red-800 animate-in fade-in">
                    <AlertCircle className="h-4 w-4 shrink-0 text-red-600 mt-0.5" />
                    <div className="flex-1">
                      <p className="font-semibold text-red-950">Payment Notice</p>
                      <p className="mt-0.5 text-red-800">{error}</p>
                      {activeMethod !== 'RTGS' && enabledMethods.rtgs ? (
                        <p className="mt-1.5 text-[11px] font-medium text-red-900">
                          Tip: Switch to <button type="button" onClick={() => setActiveMethod('RTGS')} className="underline font-bold hover:text-red-950">Bank Transfer (RTGS)</button> to submit receipt directly.
                        </p>
                      ) : null}
                    </div>
                  </div>
                ) : null}

                {message ? (
                  <div className="flex items-start gap-2.5 rounded-xl border border-emerald-200 bg-emerald-50 p-3.5 text-xs text-emerald-900 animate-in fade-in">
                    <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600 mt-0.5" />
                    <div>
                      <p className="font-semibold text-emerald-950">Success</p>
                      <p className="mt-0.5 text-emerald-800">{message}</p>
                    </div>
                  </div>
                ) : null}

                {/* RTGS / BANK TRANSFER DETAILS SECTION */}
                {activeMethod === 'RTGS' && enabledMethods.rtgs && settings ? (
                  <div className="space-y-4 animate-in fade-in duration-150">
                    
                    {/* Bank Account Grid Card */}
                    <div className="overflow-hidden rounded-xl border border-gray-200 bg-[#FAFAFA]">
                      <div className="flex items-center justify-between border-b border-gray-200 bg-gray-100/70 px-4 py-2.5">
                        <div className="flex items-center gap-1.5">
                          <Building2 className="h-3.5 w-3.5 text-[#D97706]" />
                          <span className="text-[11px] font-bold uppercase tracking-wider text-gray-700">
                            Bank Details for RTGS / Transfer
                          </span>
                        </div>
                        <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-semibold text-emerald-800">
                          Verified Escrow
                        </span>
                      </div>

                      <div className="grid gap-2.5 p-3.5 sm:grid-cols-2">
                        <CopyableBankField
                          label="Beneficiary Name"
                          value={settings.rtgs.beneficiaryName}
                          copiedField={copiedField}
                          onCopy={() => copyToClipboard(settings.rtgs.beneficiaryName, 'Beneficiary Name')}
                        />
                        <CopyableBankField
                          label="Bank Name"
                          value={settings.rtgs.bankName}
                          copiedField={copiedField}
                          onCopy={() => copyToClipboard(settings.rtgs.bankName, 'Bank Name')}
                        />
                        <CopyableBankField
                          label="Account Number"
                          value={settings.rtgs.accountNumber}
                          copiedField={copiedField}
                          isMonospace
                          onCopy={() => copyToClipboard(settings.rtgs.accountNumber, 'Account Number')}
                        />
                        <CopyableBankField
                          label="IFSC Code"
                          value={settings.rtgs.ifscCode}
                          copiedField={copiedField}
                          isMonospace
                          onCopy={() => copyToClipboard(settings.rtgs.ifscCode, 'IFSC Code')}
                        />
                        <CopyableBankField
                          label="Branch Name"
                          value={settings.rtgs.branchName}
                          copiedField={copiedField}
                          onCopy={() => copyToClipboard(settings.rtgs.branchName, 'Branch Name')}
                        />
                        <div className="rounded-lg border border-amber-300 bg-[#FFFBEB] p-2.5">
                          <span className="text-[10px] font-bold uppercase tracking-wider text-amber-800">Amount to Transfer</span>
                          <p className="mt-0.5 text-sm font-bold text-gray-900">{formatCurrency(amount)}</p>
                        </div>
                      </div>
                    </div>

                    {/* Instructions Callout */}
                    {settings.rtgs.instructions ? (
                      <div className="flex items-start gap-2.5 rounded-xl border border-amber-200 bg-[#FFFBEB] p-3.5 text-xs text-amber-950">
                        <Info className="h-4 w-4 shrink-0 text-amber-600 mt-0.5" />
                        <div className="space-y-0.5">
                          <p className="font-semibold uppercase tracking-wider text-[10px] text-amber-900">Payment Instructions</p>
                          <p className="whitespace-pre-line leading-relaxed text-xs">{settings.rtgs.instructions}</p>
                        </div>
                      </div>
                    ) : null}

                    {/* Payment Submission Inputs */}
                    <div className="space-y-3.5 rounded-xl border border-gray-200 bg-white p-4">
                      <h3 className="text-xs font-bold uppercase tracking-wider text-gray-800">Submit Verification Proof</h3>

                      {/* UTR / Reference Input */}
                      <div>
                        <label htmlFor="utr-input" className="mb-1 block text-xs font-medium text-gray-700">
                          UTR / Transaction Reference Number <span className="text-red-500">*</span>
                        </label>
                        <input
                          id="utr-input"
                          type="text"
                          placeholder="Enter UTR / Reference number"
                          value={transactionRef}
                          onChange={(event) => setTransactionRef(event.target.value)}
                          className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-xs font-medium text-gray-900 outline-none transition-all focus:border-[#FFC107] focus:ring-2 focus:ring-[#FFC107]/20"
                        />
                      </div>

                      {/* Payment Note */}
                      <div>
                        <label htmlFor="note-input" className="mb-1 block text-xs font-medium text-gray-700">
                          Payment Note <span className="text-gray-400 font-normal">(Optional)</span>
                        </label>
                        <textarea
                          id="note-input"
                          placeholder="Additional remarks..."
                          value={paymentNote}
                          onChange={(event) => setPaymentNote(event.target.value)}
                          rows={2}
                          className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-xs text-gray-900 outline-none transition-all focus:border-[#FFC107] focus:ring-2 focus:ring-[#FFC107]/20"
                        />
                      </div>

                      {/* Receipt File Upload */}
                      <div>
                        <span className="mb-1 block text-xs font-medium text-gray-700">
                          Upload Receipt / Slip <span className="text-red-500">*</span>
                        </span>

                        {!receiptUrl ? (
                          <label className="group relative flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed border-gray-300 bg-[#FAFAFA] p-4 text-center transition-all hover:border-[#FFC107] hover:bg-[#FFFBEB]/40">
                            <input
                              type="file"
                              accept=".jpg,.jpeg,.png,.webp,.pdf"
                              className="hidden"
                              onChange={(event) => void handleReceiptUpload(event)}
                            />
                            {uploading ? (
                              <div className="flex flex-col items-center gap-1.5">
                                <BrandLoader size="xs" variant="inline" bg="light" />
                                <span className="text-xs font-medium text-gray-700">Compressing &amp; uploading receipt file...</span>
                              </div>
                            ) : (
                              <div className="flex flex-col items-center gap-1">
                                <div className="flex h-8 w-8 items-center justify-center rounded-full bg-amber-100 text-amber-700 transition-transform group-hover:scale-105">
                                  <UploadCloud className="h-4 w-4" />
                                </div>
                                <div>
                                  <p className="text-xs font-semibold text-gray-800">Click to upload payment receipt</p>
                                  <p className="text-[10px] font-normal text-gray-500">Auto-compressed JPG, PNG, WEBP, PDF accepted</p>
                                </div>
                              </div>
                            )}
                          </label>
                        ) : (
                          <div className="flex items-center justify-between rounded-lg border border-emerald-200 bg-emerald-50/80 p-2.5">
                            <div className="flex items-center gap-2 overflow-hidden">
                              <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-emerald-100 text-emerald-800">
                                <FileText className="h-3.5 w-3.5" />
                              </div>
                              <div className="truncate">
                                <p className="truncate text-xs font-semibold text-emerald-950">{receiptName || 'Receipt File'}</p>
                                <button
                                  type="button"
                                  onClick={() => setViewingReceiptUrl(receiptUrl)}
                                  className="inline-flex items-center gap-1 text-[10px] font-medium text-emerald-700 hover:underline"
                                >
                                  <Eye className="h-3 w-3" /> View Receipt Popup
                                </button>
                              </div>
                            </div>

                            <button
                              type="button"
                              onClick={() => {
                                setReceiptUrl(null);
                                setReceiptName(null);
                              }}
                              className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-gray-400 hover:bg-red-100 hover:text-red-600 transition-colors"
                              title="Remove file"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        )}
                      </div>

                      {/* Submit Proof CTA */}
                      <button
                        type="button"
                        onClick={() => void handleRtgsSubmit()}
                        disabled={submitting || uploading || !receiptUrl || !transactionRef.trim()}
                        className="mt-1 flex w-full items-center justify-center gap-2 rounded-xl bg-[#FFC107] py-3 text-xs font-bold text-black shadow-2xs transition-all hover:bg-[#e5ad06] active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        {submitting ? <Loader2 className="h-4 w-4 animate-spin text-black" /> : <CheckCircle2 className="h-4 w-4" />}
                        Submit Payment Proof
                      </button>
                    </div>
                  </div>
                ) : null}

                {/* RAZORPAY GATEWAY */}
                {activeMethod === 'RAZORPAY' && enabledMethods.razorpay ? (
                  <div className="space-y-3.5 rounded-xl border border-gray-200 bg-[#FAFAFA] p-4 animate-in fade-in duration-150">
                    <div className="flex items-center gap-2.5">
                      <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-sky-100 text-sky-700">
                        <CreditCard className="h-4 w-4" />
                      </div>
                      <div>
                        <h3 className="text-xs font-bold text-gray-900">Razorpay Online Gateway</h3>
                        <p className="text-[10px] text-gray-500">Credit/Debit Cards, NetBanking, Wallets</p>
                      </div>
                    </div>

                    <div className="rounded-lg border border-gray-200 bg-white p-3 text-xs">
                      <div className="flex items-center justify-between text-gray-600">
                        <span>Listing Price:</span>
                        <span className="font-semibold text-gray-900">{formatCurrency(amount)}</span>
                      </div>
                      <div className="mt-1.5 flex items-center justify-between border-t border-gray-100 pt-1.5 text-xs font-bold text-gray-900">
                        <span>Total Payable:</span>
                        <span className="text-[#D97706]">{formatCurrency(amount)}</span>
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={() => void handleRazorpayPayment()}
                      disabled={submitting}
                      className="flex w-full items-center justify-center gap-2 rounded-xl bg-[#111827] py-3 text-xs font-bold text-white shadow-2xs transition-all hover:bg-black active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {submitting ? <Loader2 className="h-4 w-4 animate-spin text-amber-400" /> : <ShieldCheck className="h-4 w-4 text-[#FFC107]" />}
                      Proceed to Pay {formatCurrency(amount)}
                    </button>
                  </div>
                ) : null}

                {/* PHONEPE GATEWAY */}
                {activeMethod === 'PHONEPE' && enabledMethods.phonepe ? (
                  <div className="space-y-3.5 rounded-xl border border-purple-200 bg-[#FDF4FF]/30 p-4 animate-in fade-in duration-150">
                    <div className="flex items-center gap-2.5">
                      <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-purple-100 text-purple-700">
                        <Smartphone className="h-4 w-4" />
                      </div>
                      <div>
                        <h3 className="text-xs font-bold text-purple-950">PhonePe Direct Checkout</h3>
                        <p className="text-[10px] text-purple-700">Instant UPI & Mobile Payment</p>
                      </div>
                    </div>

                    <div className="rounded-lg border border-purple-100 bg-white p-3 text-xs">
                      <div className="flex items-center justify-between text-gray-600">
                        <span>Listing Price:</span>
                        <span className="font-semibold text-gray-900">{formatCurrency(amount)}</span>
                      </div>
                      <div className="mt-1.5 flex items-center justify-between border-t border-gray-100 pt-1.5 text-xs font-bold text-gray-900">
                        <span>Total Payable:</span>
                        <span className="text-purple-700">{formatCurrency(amount)}</span>
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={() => void handlePhonePePayment()}
                      disabled={submitting}
                      className="flex w-full items-center justify-center gap-2 rounded-xl bg-[#5f259f] py-3 text-xs font-bold text-white shadow-2xs transition-all hover:bg-[#4d1f82] active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Smartphone className="h-4 w-4" />}
                      Pay with PhonePe ({formatCurrency(amount)})
                    </button>
                  </div>
                ) : null}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* RECEIPT PREVIEW MODAL POPUP (NO NEXT TAB NAV) */}
      {viewingReceiptUrl ? (
        <ReceiptPreviewModal
          fileUrl={viewingReceiptUrl}
          onClose={() => setViewingReceiptUrl(null)}
        />
      ) : null}
    </>
  );
}

function CopyableBankField({
  label,
  value,
  copiedField,
  isMonospace,
  onCopy,
}: {
  label: string;
  value?: string | null;
  copiedField: string | null;
  isMonospace?: boolean;
  onCopy: () => void;
}) {
  const isCopied = copiedField === label;

  return (
    <div className="relative rounded-lg border border-gray-200/90 bg-white p-2.5 shadow-2xs hover:border-gray-300 transition-colors">
      <div className="flex items-center justify-between">
        <span className="text-[10px] font-semibold uppercase tracking-wider text-gray-500">{label}</span>
        {value ? (
          <button
            type="button"
            onClick={onCopy}
            className="flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[10px] font-bold text-amber-800 bg-amber-50 hover:bg-amber-100 border border-amber-200/70 transition-colors"
            title={`Copy ${label}`}
          >
            {isCopied ? (
              <>
                <Check className="h-3 w-3 text-emerald-600" />
                <span className="text-emerald-700 font-bold">Copied!</span>
              </>
            ) : (
              <>
                <Copy className="h-3 w-3 text-amber-700" />
                <span>Copy</span>
              </>
            )}
          </button>
        ) : null}
      </div>
      <p
        className={`mt-0.5 break-all text-xs font-semibold text-gray-800 ${
          isMonospace ? 'font-mono font-bold tracking-wide text-gray-900' : ''
        }`}
      >
        {value || 'Not configured'}
      </p>
    </div>
  );
}
