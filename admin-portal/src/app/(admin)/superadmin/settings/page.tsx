'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import type { AxiosError } from 'axios';
import { Building2, CreditCard, Eye, EyeOff, FileText, HardDrive, ImagePlus, KeyRound, Mail, Phone, Save, ShieldCheck } from 'lucide-react';
import { toast } from 'react-toastify';
import api from '@/lib/api';
import SearchableSelect, { type Option } from '@/components/ui/SearchableSelect';
import HomepageContentSettings from '@/components/admin/HomepageContentSettings';

const INDIAN_STATES = [
  'Andhra Pradesh',
  'Arunachal Pradesh',
  'Assam',
  'Bihar',
  'Chhattisgarh',
  'Goa',
  'Gujarat',
  'Haryana',
  'Himachal Pradesh',
  'Jharkhand',
  'Karnataka',
  'Kerala',
  'Madhya Pradesh',
  'Maharashtra',
  'Manipur',
  'Meghalaya',
  'Mizoram',
  'Nagaland',
  'Odisha',
  'Punjab',
  'Rajasthan',
  'Sikkim',
  'Tamil Nadu',
  'Telangana',
  'Tripura',
  'Uttar Pradesh',
  'Uttarakhand',
  'West Bengal',
  'Andaman and Nicobar Islands',
  'Chandigarh',
  'Dadra and Nagar Haveli and Daman and Diu',
  'Delhi',
  'Jammu and Kashmir',
  'Ladakh',
  'Lakshadweep',
  'Puducherry',
];

type CompanyInvoiceFormState = {
  companyName: string;
  gstin: string;
  address: string;
  state: string;
  city: string;
  defaultGstRate: string;
  termsAndConditions: string;
};

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
    apiKeyConfigured?: boolean;
    otpId: string;
    otpExpiry: number;
    otpLength: number;
    variablesValues: string;
    updatedAt?: string | null;
    updatedByUserId?: string | null;
  };
  emailOtp: {
    enabled: boolean;
    smtpHost: string;
    smtpPort: number;
    smtpSecure: boolean;
    senderEmail: string;
    senderName: string;
    appPassword: string;
    appPasswordConfigured?: boolean;
    otpExpiryMinutes: number;
    otpLength: number;
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
  listingPayment: ListingPaymentFormState;
  companyInvoice?: CompanyInvoiceFormState;
  mobileApp?: {
    playStoreLink: string | null;
    appStoreLink: string | null;
    updatedAt?: string | null;
  };
};

type AdminSecretKey =
  | 'mobileOtpApiKey'
  | 'emailOtpAppPassword'
  | 'razorpayKeySecret'
  | 'razorpayWebhookSecret'
  | 'phonepeClientSecret'
  | 'googleDriveClientSecret'
  | 'googleDriveRefreshToken';

const isMaskedSecretValue = (value: string) => /^\*+$/.test(value.trim());

type MobileAppFormState = {
  playStoreLink: string;
  appStoreLink: string;
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

type ListingPaymentFormPatch = {
  rtgs?: Partial<ListingPaymentFormState['rtgs']>;
  razorpay?: Partial<ListingPaymentFormState['razorpay']>;
  phonepe?: Partial<ListingPaymentFormState['phonepe']>;
};

type MobileOtpFormState = {
  enabled: boolean;
  apiKey: string;
  otpId: string;
  otpExpiry: string;
  otpLength: string;
  variablesValues: string;
};

const getApiErrorMessage = (error: unknown, fallbackMessage: string) => {
  const axiosError = error as AxiosError<{ error?: string }>;
  return axiosError.response?.data?.error || fallbackMessage;
};

type EmailOtpFormState = {
  enabled: boolean;
  senderEmail: string;
  senderName: string;
  appPassword: string;
  otpExpiryMinutes: string;
  otpLength: string;
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

export default function SuperAdminSettingsPage() {
  const [activeTab, setActiveTab] = useState<'security' | 'leadRouting' | 'homepage' | 'payments' | 'invoice' | 'mobileApp' | 'googleDrive'>('security');
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
  const [listingPaymentSaving, setListingPaymentSaving] = useState(false);
  const [googleDriveSaving, setGoogleDriveSaving] = useState(false);
  const [showGoogleClientId, setShowGoogleClientId] = useState(false);
  const [showGoogleDriveClientId, setShowGoogleDriveClientId] = useState(false);
  const [showGoogleDriveClientSecret, setShowGoogleDriveClientSecret] = useState(false);
  const [showGoogleDriveRefreshToken, setShowGoogleDriveRefreshToken] = useState(false);
  const [revealedSecrets, setRevealedSecrets] = useState<Partial<Record<AdminSecretKey, string>>>({});
  const [revealingSecret, setRevealingSecret] = useState<AdminSecretKey | null>(null);
  const [mobileAppSaving, setMobileAppSaving] = useState(false);

  const [googleDriveSettings, setGoogleDriveSettings] = useState({
    clientId: '',
    clientSecret: '',
    refreshToken: '',
    backupFolderId: '',
  });

  const [mobileAppForm, setMobileAppForm] = useState<MobileAppFormState>({
    playStoreLink: '',
    appStoreLink: '',
  });

  const [customerPrimeForm, setCustomerPrimeForm] = useState<CustomerPrimeFormState>({
    enabled: false,
    upiId: '',
    amount: '',
    validityValue: '',
    validityUnit: 'DAYS',
  });
  const [listingPaymentForm, setListingPaymentForm] = useState<ListingPaymentFormState>(emptyListingPaymentForm);

  const [dbStates, setDbStates] = useState<{ id: string | number; name: string }[]>([]);
  const [dbCities, setDbCities] = useState<{ id: string | number; name: string }[]>([]);

  const [companyInvoiceForm, setCompanyInvoiceForm] = useState<CompanyInvoiceFormState>({
    companyName: 'JCB Exchange',
    gstin: '',
    address: '',
    state: 'Maharashtra',
    city: 'Mumbai',
    defaultGstRate: '18',
    termsAndConditions: 'This is a computer-generated tax invoice and does not require a physical signature.',
  });
  const [invoiceSaving, setInvoiceSaving] = useState(false);

  const revealSecret = useCallback(async (key: AdminSecretKey) => {
    const cachedValue = revealedSecrets[key];
    if (cachedValue) {
      return cachedValue;
    }

    setRevealingSecret(key);
    try {
      const response = await api.get<{ value?: string }>(`/superadmin/settings/secrets/${encodeURIComponent(key)}`);
      const value = response.data.value || '';
      if (!value) {
        toast.info('This secret is not configured.');
        return null;
      }

      setRevealedSecrets((current) => ({ ...current, [key]: value }));
      return value;
    } catch (error: unknown) {
      toast.error(getApiErrorMessage(error, 'Unable to reveal this secret.'));
      return null;
    } finally {
      setRevealingSecret(null);
    }
  }, [revealedSecrets]);

  useEffect(() => {
    if (activeTab !== 'invoice') {
      return;
    }

    const fetchStates = async () => {
      try {
        const countriesRes = await api.get<{ id: string | number; name: string }[]>('/locations/countries');
        const india = (countriesRes.data || []).find((c) => c.name === 'India');
        if (india) {
          const statesRes = await api.get<{ id: string | number; name: string }[]>(`/locations/states/${india.id}`);
          if (statesRes.data && statesRes.data.length > 0) {
            setDbStates(statesRes.data);
          }
        }
      } catch {
        // Fallback to static list
      }
    };
    void fetchStates();
  }, [activeTab]);

  useEffect(() => {
    if (activeTab !== 'invoice') {
      return;
    }

    const fetchCities = async () => {
      if (!companyInvoiceForm.state) return;
      const matchedState = dbStates.find(
        (s) => s.name.toLowerCase() === companyInvoiceForm.state.toLowerCase(),
      );
      if (matchedState) {
        try {
          const citiesRes = await api.get<{ id: string | number; name: string }[]>(`/locations/cities/${matchedState.id}`);
          setDbCities(citiesRes.data || []);
        } catch {
          setDbCities([]);
        }
      } else {
        setDbCities([]);
      }
    };
    void fetchCities();
  }, [activeTab, companyInvoiceForm.state, dbStates]);

  const stateOptions: Option[] = useMemo(() => {
    if (dbStates.length > 0) {
      return dbStates.map((s) => ({ id: s.id, name: s.name }));
    }
    return INDIAN_STATES.map((s) => ({ id: s, name: s }));
  }, [dbStates]);

  const cityOptions: Option[] = useMemo(() => {
    return dbCities.map((c) => ({ id: c.id, name: c.name }));
  }, [dbCities]);

  const [mobileOtpForm, setMobileOtpForm] = useState<MobileOtpFormState>({
    enabled: false,
    apiKey: '',
    otpId: '',
    otpExpiry: '15',
    otpLength: '6',
    variablesValues: '',
  });
  const [otpSaving, setOtpSaving] = useState(false);
  const [emailOtpForm, setEmailOtpForm] = useState<EmailOtpFormState>({
    enabled: false,
    senderEmail: '',
    senderName: 'JCB Exchange',
    appPassword: '',
    otpExpiryMinutes: '10',
    otpLength: '6',
  });
  const [emailOtpSaving, setEmailOtpSaving] = useState(false);

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
        otpId: response.data.mobileOtp.otpId || '',
        otpExpiry: String(response.data.mobileOtp.otpExpiry || 15),
        otpLength: String(response.data.mobileOtp.otpLength || 6),
        variablesValues: response.data.mobileOtp.variablesValues || '',
      });
      setEmailOtpForm({
        enabled: response.data.emailOtp.enabled === true,
        senderEmail: response.data.emailOtp.senderEmail || '',
        senderName: response.data.emailOtp.senderName || 'JCB Exchange',
        appPassword: response.data.emailOtp.appPassword || '',
        otpExpiryMinutes: String(response.data.emailOtp.otpExpiryMinutes || 10),
        otpLength: String(response.data.emailOtp.otpLength || 6),
      });
      setCustomerPrimeForm({
        enabled: response.data.customerPrime.enabled,
        upiId: response.data.customerPrime.upiId || '',
        amount: response.data.customerPrime.amount ? String(response.data.customerPrime.amount) : '',
        validityValue: response.data.customerPrime.validityValue ? String(response.data.customerPrime.validityValue) : '',
        validityUnit: response.data.customerPrime.validityUnit || 'DAYS',
      });
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
      if (response.data.companyInvoice) {
        setCompanyInvoiceForm({
          companyName: response.data.companyInvoice.companyName || 'JCB Exchange',
          gstin: response.data.companyInvoice.gstin || '',
          address: response.data.companyInvoice.address || '',
          state: response.data.companyInvoice.state || 'Maharashtra',
          city: response.data.companyInvoice.city || 'Mumbai',
          defaultGstRate: response.data.companyInvoice.defaultGstRate !== undefined ? String(response.data.companyInvoice.defaultGstRate) : '18',
          termsAndConditions: response.data.companyInvoice.termsAndConditions || 'This is a computer-generated tax invoice and does not require a physical signature.',
        });
      }

      setMobileAppForm({
        playStoreLink: response.data.mobileApp?.playStoreLink || '',
        appStoreLink: response.data.mobileApp?.appStoreLink || '',
      });

      // Fetch Google Drive settings
      try {
        const driveRes = await api.get('/superadmin/google-drive');
        const driveSettings = driveRes.data.googleDrive || {};
        setGoogleDriveSettings({
          clientId: driveSettings.clientId || '',
          clientSecret: driveSettings.clientSecret || '',
          refreshToken: driveSettings.refreshToken || '',
          backupFolderId: driveSettings.backupFolderId || '',
        });
      } catch (err) {
        console.warn('Failed to load Google Drive settings:', err);
      }
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
          otpId: mobileOtpForm.otpId,
          otpExpiry: Number(mobileOtpForm.otpExpiry),
          otpLength: Number(mobileOtpForm.otpLength),
          variablesValues: mobileOtpForm.variablesValues,
        },
      });

      setMobileOtpForm({
        enabled: response.data.mobileOtp.enabled,
        apiKey: response.data.mobileOtp.apiKey || '',
        otpId: response.data.mobileOtp.otpId || '',
        otpExpiry: String(response.data.mobileOtp.otpExpiry || 15),
        otpLength: String(response.data.mobileOtp.otpLength || 6),
        variablesValues: response.data.mobileOtp.variablesValues || '',
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

  const handleEmailOtpSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setEmailOtpSaving(true);

    try {
      const response = await api.patch<{
        message: string;
        emailOtp: SettingsResponse['emailOtp'];
      }>('/superadmin/settings', {
        emailOtp: {
          enabled: emailOtpForm.enabled,
          senderEmail: emailOtpForm.senderEmail,
          senderName: emailOtpForm.senderName,
          appPassword: emailOtpForm.appPassword,
          otpExpiryMinutes: Number(emailOtpForm.otpExpiryMinutes),
          otpLength: Number(emailOtpForm.otpLength),
        },
      });

      setEmailOtpForm({
        enabled: response.data.emailOtp.enabled === true,
        senderEmail: response.data.emailOtp.senderEmail || '',
        senderName: response.data.emailOtp.senderName || 'JCB Exchange',
        appPassword: response.data.emailOtp.appPassword || '',
        otpExpiryMinutes: String(response.data.emailOtp.otpExpiryMinutes || 10),
        otpLength: String(response.data.emailOtp.otpLength || 6),
      });
      toast.success(response.data.message);
    } catch (error: unknown) {
      toast.error(getApiErrorMessage(error, 'Unable to save email OTP settings.'));
    } finally {
      setEmailOtpSaving(false);
    }
  };

  const updateEmailOtpForm = (nextState: Partial<EmailOtpFormState>) => {
    setEmailOtpForm((currentState) => ({
      ...currentState,
      ...nextState,
    }));
  };

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

  const handleMobileAppSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setMobileAppSaving(true);

    try {
      const response = await api.patch<{
        message: string;
        mobileApp: SettingsResponse['mobileApp'];
      }>('/superadmin/settings', {
        mobileApp: {
          playStoreLink: mobileAppForm.playStoreLink,
          appStoreLink: mobileAppForm.appStoreLink,
        },
      });

      setMobileAppForm({
        playStoreLink: response.data.mobileApp?.playStoreLink || '',
        appStoreLink: response.data.mobileApp?.appStoreLink || '',
      });
      toast.success(response.data.message);
    } catch (error: unknown) {
      toast.error(getApiErrorMessage(error, 'Unable to save mobile app settings.'));
    } finally {
      setMobileAppSaving(false);
    }
  };

  const updateMobileAppForm = (nextState: Partial<MobileAppFormState>) => {
    setMobileAppForm((currentState) => ({
      ...currentState,
      ...nextState,
    }));
  };

  const handleGoogleDriveSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setGoogleDriveSaving(true);
    try {
      const response = await api.put('/superadmin/google-drive', {
        clientId: googleDriveSettings.clientId,
        clientSecret: googleDriveSettings.clientSecret,
        refreshToken: googleDriveSettings.refreshToken,
        backupFolderId: googleDriveSettings.backupFolderId,
      });
      const driveSettings = response.data.googleDrive || {};
      setGoogleDriveSettings({
        clientId: driveSettings.clientId || '',
        clientSecret: driveSettings.clientSecret || '',
        refreshToken: driveSettings.refreshToken || '',
        backupFolderId: driveSettings.backupFolderId || '',
      });
      toast.success(response.data.message || 'Google Drive settings updated successfully.');
    } catch (error: unknown) {
      toast.error(getApiErrorMessage(error, 'Unable to save Google Drive settings.'));
    } finally {
      setGoogleDriveSaving(false);
    }
  };

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
    } catch (error: unknown) {
      toast.error(getApiErrorMessage(error, 'Unable to save listing payment settings.'));
    } finally {
      setListingPaymentSaving(false);
    }
  };

  const handleInvoiceSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setInvoiceSaving(true);

    try {
      const response = await api.patch<{
        message: string;
        companyInvoice: CompanyInvoiceFormState;
      }>('/superadmin/settings', {
        companyInvoice: {
          companyName: companyInvoiceForm.companyName,
          gstin: companyInvoiceForm.gstin,
          address: companyInvoiceForm.address,
          state: companyInvoiceForm.state,
          city: companyInvoiceForm.city,
          defaultGstRate: Number(companyInvoiceForm.defaultGstRate) || 18,
          termsAndConditions: companyInvoiceForm.termsAndConditions,
        },
      });

      if (response.data.companyInvoice) {
        setCompanyInvoiceForm({
          companyName: response.data.companyInvoice.companyName || 'JCB Exchange',
          gstin: response.data.companyInvoice.gstin || '',
          address: response.data.companyInvoice.address || '',
          state: response.data.companyInvoice.state || 'Maharashtra',
          city: response.data.companyInvoice.city || 'Mumbai',
          defaultGstRate: response.data.companyInvoice.defaultGstRate !== undefined ? String(response.data.companyInvoice.defaultGstRate) : '18',
          termsAndConditions: response.data.companyInvoice.termsAndConditions || 'This is a computer-generated tax invoice and does not require a physical signature.',
        });
      }

      toast.success(response.data.message || 'Invoice & GST settings saved successfully.');
    } catch (error: unknown) {
      toast.error(getApiErrorMessage(error, 'Unable to save invoice & GST settings.'));
    } finally {
      setInvoiceSaving(false);
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
    <div className="mx-auto w-full max-w-7xl space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-gray-900">Settings</h2>
      </div>

      <div className="flex flex-col items-start gap-6 lg:gap-8 md:flex-row min-w-0 w-full">
        <aside className="w-full flex-shrink-0 md:w-52 lg:w-60">
          <nav className="flex flex-col gap-1 rounded-xl border border-gray-200 bg-white p-2 shadow-sm">
            <button
              type="button"
              onClick={() => setActiveTab('security')}
              className={`flex items-center gap-3 rounded-lg border-l-4 px-3 py-2.5 text-sm font-semibold transition-colors ${activeTab === 'security'
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
              className={`flex items-center gap-3 rounded-lg border-l-4 px-3 py-2.5 text-sm font-semibold transition-colors ${activeTab === 'leadRouting'
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
              className={`flex items-center gap-3 rounded-lg border-l-4 px-3 py-2.5 text-sm font-semibold transition-colors ${activeTab === 'homepage'
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
              className={`flex items-center gap-3 rounded-lg border-l-4 px-3 py-2.5 text-sm font-semibold transition-colors ${activeTab === 'payments'
                  ? 'border-yellow-400 bg-yellow-50 text-yellow-800'
                  : 'border-transparent text-gray-600 hover:bg-gray-50'
                }`}
            >
              <CreditCard className="h-4 w-4" />
              Payments
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('invoice')}
              className={`flex items-center gap-3 rounded-lg border-l-4 px-3 py-2.5 text-sm font-semibold transition-colors ${activeTab === 'invoice'
                  ? 'border-yellow-400 bg-yellow-50 text-yellow-800'
                  : 'border-transparent text-gray-600 hover:bg-gray-50'
                }`}
            >
              <FileText className="h-4 w-4" />
              Invoice & GST
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('mobileApp')}
              className={`flex items-center gap-3 rounded-lg border-l-4 px-3 py-2.5 text-sm font-semibold transition-colors ${activeTab === 'mobileApp'
                  ? 'border-yellow-400 bg-yellow-50 text-yellow-800'
                  : 'border-transparent text-gray-600 hover:bg-gray-50'
                }`}
            >
              <Phone className="h-4 w-4" />
              Mobile App
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('googleDrive')}
              className={`flex items-center gap-3 rounded-lg border-l-4 px-3 py-2.5 text-sm font-semibold transition-colors ${activeTab === 'googleDrive'
                  ? 'border-yellow-400 bg-yellow-50 text-yellow-800'
                  : 'border-transparent text-gray-600 hover:bg-gray-50'
                }`}
            >
              <HardDrive className="h-4 w-4" />
              Google Drive
            </button>
          </nav>
        </aside>

        <div className="w-full flex-1 min-w-0 space-y-6">
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
                      className={`inline-flex w-fit items-center gap-2 rounded-lg border px-3 py-1.5 text-sm font-medium ${googleAuthEnabled
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
                        className={`flex min-w-[168px] items-center justify-between rounded-full border px-2 py-2 text-xs font-bold uppercase tracking-wide transition-colors ${googleAuthEnabled
                            ? 'border-emerald-200 bg-emerald-100 text-emerald-700'
                            : 'border-gray-300 bg-white text-gray-600'
                          } ${googleToggleSaving ? 'cursor-not-allowed opacity-60' : ''}`}
                      >
                        <span
                          className={`relative inline-flex h-8 w-14 items-center rounded-full transition-colors ${googleAuthEnabled ? 'bg-emerald-500' : 'bg-gray-300'
                            }`}
                        >
                          <span
                            className={`inline-block h-6 w-6 transform rounded-full bg-white shadow-sm transition-transform ${googleAuthEnabled ? 'translate-x-7' : 'translate-x-1'
                              }`}
                          />
                        </span>
                        <span className="sr-only">
                          {googleToggleSaving ? 'Updating Google login setting' : 'Toggle Google login'}
                        </span>
                      </button>
                    </div>
                  </div>

                  <div className="block">
                    <span className="mb-1.5 block text-sm font-semibold text-gray-700">Google OAuth Client ID</span>
                    <div className="relative">
                      <KeyRound className="absolute left-3 top-3.5 h-4 w-4 text-gray-400" />
                      <input
                        type={showGoogleClientId ? 'text' : 'password'}
                        value={googleClientId}
                        onChange={(event) => setGoogleClientId(event.target.value)}
                        placeholder="Paste Google web client ID"
                        autoComplete="new-password"
                        className="w-full rounded-lg border border-gray-300 bg-white py-3 pl-10 pr-11 text-sm text-gray-900 outline-none transition focus:border-[#FFC107] focus:ring-1 focus:ring-[#FFC107]"
                      />
                      <button
                        type="button"
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          setShowGoogleClientId((current) => !current);
                        }}
                        className="absolute inset-y-0 right-0 flex items-center pr-3 text-gray-500 hover:text-gray-700 focus:outline-none transition"
                        aria-label={showGoogleClientId ? 'Hide Google OAuth Client ID' : 'Show Google OAuth Client ID'}
                      >
                        {showGoogleClientId ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      </button>
                    </div>
                  </div>

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
                        className={`flex min-w-[168px] items-center justify-between rounded-full border px-2 py-2 text-xs font-bold uppercase tracking-wide transition-colors ${mobileOtpForm.enabled
                            ? 'border-emerald-200 bg-emerald-100 text-emerald-700'
                            : 'border-gray-300 bg-white text-gray-600'
                          }`}
                      >
                        <span
                          className={`relative inline-flex h-8 w-14 items-center rounded-full transition-colors ${mobileOtpForm.enabled ? 'bg-emerald-500' : 'bg-gray-300'
                            }`}
                        >
                          <span
                            className={`inline-block h-6 w-6 transform rounded-full bg-white shadow-sm transition-transform ${mobileOtpForm.enabled ? 'translate-x-7' : 'translate-x-1'
                              }`}
                          />
                        </span>
                      </button>
                    </div>
                  </div>

                  <div className="grid gap-5 md:grid-cols-2">
                    <SettingsInput
                      key={`mobile-otp-api-key-${isMaskedSecretValue(mobileOtpForm.apiKey) ? 'masked' : 'editable'}`}
                      label="SMS API Key"
                      type="password"
                      value={mobileOtpForm.apiKey}
                      onChange={(value) => updateMobileOtpForm({ apiKey: value })}
                      placeholder="Enter SMS API key"
                      onReveal={() => revealSecret('mobileOtpApiKey')}
                      isRevealing={revealingSecret === 'mobileOtpApiKey'}
                    />

                    <label className="block">
                      <span className="mb-1.5 block text-sm font-semibold text-gray-700">Flowitof Smart OTP Template ID (otp_id)</span>
                      <input
                        type="text"
                        value={mobileOtpForm.otpId}
                        onChange={(event) => updateMobileOtpForm({ otpId: event.target.value })}
                        placeholder="Enter Smart OTP template ID"
                        className="w-full rounded-lg border border-gray-300 bg-white px-4 py-3 text-sm text-gray-900 outline-none transition focus:border-[#FFC107] focus:ring-1 focus:ring-[#FFC107]"
                      />
                    </label>
                  </div>

                  <div className="grid gap-5 md:grid-cols-2">
                    <label className="block">
                      <span className="mb-1.5 block text-sm font-semibold text-gray-700">OTP Expiry (minutes)</span>
                      <input
                        type="number"
                        min={1}
                        max={10080}
                        value={mobileOtpForm.otpExpiry}
                        onChange={(event) => updateMobileOtpForm({ otpExpiry: event.target.value })}
                        placeholder="15"
                        className="w-full rounded-lg border border-gray-300 bg-white px-4 py-3 text-sm text-gray-900 outline-none transition focus:border-[#FFC107] focus:ring-1 focus:ring-[#FFC107]"
                      />
                    </label>

                    <label className="block">
                      <span className="mb-1.5 block text-sm font-semibold text-gray-700">OTP Length</span>
                      <input
                        type="number"
                        min={4}
                        max={10}
                        value={mobileOtpForm.otpLength}
                        onChange={(event) => updateMobileOtpForm({ otpLength: event.target.value })}
                        className="w-full rounded-lg border border-gray-300 bg-white px-4 py-3 text-sm text-gray-900 outline-none transition focus:border-[#FFC107] focus:ring-1 focus:ring-[#FFC107]"
                      />
                    </label>
                  </div>

                  <label className="block">
                    <span className="mb-1.5 block text-sm font-semibold text-gray-700">Extra Template Values (optional)</span>
                    <input
                      type="text"
                      value={mobileOtpForm.variablesValues}
                      onChange={(event) => updateMobileOtpForm({ variablesValues: event.target.value })}
                      placeholder="Example: 15 or value1|15"
                      className="w-full rounded-lg border border-gray-300 bg-white px-4 py-3 text-sm text-gray-900 outline-none transition focus:border-[#FFC107] focus:ring-1 focus:ring-[#FFC107]"
                    />
                    <span className="mt-1 block text-xs text-gray-500">
                      Enter additional template values only; OTP is automatically appended. Use | to separate multiple values.
                    </span>
                  </label>

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

              <section className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
                <div className="mb-6">
                  <p className="text-xs font-semibold uppercase tracking-wider text-gray-500">Authentication Settings</p>
                  <h3 className="mt-1 text-xl font-bold text-gray-900">Email OTP / Gmail SMTP</h3>
                  <p className="mt-2 text-sm text-gray-500">
                    Use a Gmail App Password. Your normal Gmail password will not work with SMTP.
                  </p>
                </div>

                <form onSubmit={handleEmailOtpSubmit} className="space-y-6">
                  <div className="rounded-2xl border border-gray-200 bg-gray-50 p-4">
                    <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                      <div>
                        <h4 className="text-sm font-semibold text-gray-900">Enable Email OTP Login</h4>
                        <p className="mt-1 text-xs text-gray-500">
                          When enabled, Email OTP appears on the public login form. When disabled, it is hidden.
                        </p>
                      </div>

                      <button
                        type="button"
                        role="switch"
                        aria-checked={emailOtpForm.enabled}
                        aria-label="Toggle Email OTP"
                        onClick={() => updateEmailOtpForm({ enabled: !emailOtpForm.enabled })}
                        className={`flex min-w-[168px] items-center justify-between rounded-full border px-2 py-2 text-xs font-bold uppercase tracking-wide transition-colors ${emailOtpForm.enabled
                            ? 'border-emerald-200 bg-emerald-100 text-emerald-700'
                            : 'border-gray-300 bg-white text-gray-600'
                          }`}
                      >
                        <span
                          className={`relative inline-flex h-8 w-14 items-center rounded-full transition-colors ${emailOtpForm.enabled ? 'bg-emerald-500' : 'bg-gray-300'
                            }`}
                        >
                          <span
                            className={`inline-block h-6 w-6 transform rounded-full bg-white shadow-sm transition-transform ${emailOtpForm.enabled ? 'translate-x-7' : 'translate-x-1'
                              }`}
                          />
                        </span>
                      </button>
                    </div>
                  </div>

                  <div className="grid gap-5 md:grid-cols-2">
                    <label className="block">
                      <span className="mb-1.5 block text-sm font-semibold text-gray-700">Gmail sender email</span>
                      <div className="relative">
                        <Mail className="absolute left-3 top-3.5 h-4 w-4 text-gray-400" />
                        <input
                          type="email"
                          value={emailOtpForm.senderEmail}
                          onChange={(event) => updateEmailOtpForm({ senderEmail: event.target.value })}
                          placeholder="your-gmail@gmail.com"
                          className="w-full rounded-lg border border-gray-300 bg-white py-3 pl-10 pr-4 text-sm text-gray-900 outline-none transition focus:border-[#FFC107] focus:ring-1 focus:ring-[#FFC107]"
                        />
                      </div>
                    </label>

                    <label className="block">
                      <span className="mb-1.5 block text-sm font-semibold text-gray-700">Sender name</span>
                      <input
                        type="text"
                        value={emailOtpForm.senderName}
                        onChange={(event) => updateEmailOtpForm({ senderName: event.target.value })}
                        placeholder="JCB Exchange"
                        className="w-full rounded-lg border border-gray-300 bg-white px-4 py-3 text-sm text-gray-900 outline-none transition focus:border-[#FFC107] focus:ring-1 focus:ring-[#FFC107]"
                      />
                    </label>
                  </div>

                  <div>
                    <SettingsInput
                      key={`email-otp-app-password-${isMaskedSecretValue(emailOtpForm.appPassword) ? 'masked' : 'editable'}`}
                      label="Gmail App Password"
                      type="password"
                      value={emailOtpForm.appPassword}
                      onChange={(value) => updateEmailOtpForm({ appPassword: value })}
                      placeholder="16-character Gmail App Password"
                      onReveal={() => revealSecret('emailOtpAppPassword')}
                      isRevealing={revealingSecret === 'emailOtpAppPassword'}
                    />
                    <span className="mt-1 block text-xs text-gray-500">
                      Create it in Google Account &gt; Security &gt; 2-Step Verification &gt; App passwords. Leave the masked value unchanged when editing.
                    </span>
                  </div>

                  <div className="grid gap-5 md:grid-cols-2">
                    <label className="block">
                      <span className="mb-1.5 block text-sm font-semibold text-gray-700">OTP expiry (minutes)</span>
                      <input
                        type="number"
                        min={1}
                        max={60}
                        value={emailOtpForm.otpExpiryMinutes}
                        onChange={(event) => updateEmailOtpForm({ otpExpiryMinutes: event.target.value })}
                        className="w-full rounded-lg border border-gray-300 bg-white px-4 py-3 text-sm text-gray-900 outline-none transition focus:border-[#FFC107] focus:ring-1 focus:ring-[#FFC107]"
                      />
                    </label>

                    <label className="block">
                      <span className="mb-1.5 block text-sm font-semibold text-gray-700">OTP length</span>
                      <input
                        type="number"
                        min={4}
                        max={10}
                        value={emailOtpForm.otpLength}
                        onChange={(event) => updateEmailOtpForm({ otpLength: event.target.value })}
                        className="w-full rounded-lg border border-gray-300 bg-white px-4 py-3 text-sm text-gray-900 outline-none transition focus:border-[#FFC107] focus:ring-1 focus:ring-[#FFC107]"
                      />
                    </label>
                  </div>

                  <div className="flex justify-end border-t border-gray-100 pt-2">
                    <button
                      type="submit"
                      disabled={emailOtpSaving}
                      className="inline-flex items-center gap-2 rounded-lg bg-[#FFC107] px-5 py-2.5 text-sm font-semibold text-black transition hover:bg-[#E5AD06] disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      <Save className="h-4 w-4" />
                      {emailOtpSaving ? 'Saving...' : 'Save Email OTP Settings'}
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
                      className={`inline-flex w-fit items-center gap-2 rounded-lg border px-3 py-1.5 text-sm font-medium ${leadRoutingForm.useSellerContact
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
                        className={`flex min-w-[168px] items-center justify-between rounded-full border px-2 py-2 text-xs font-bold uppercase tracking-wide transition-colors ${leadRoutingForm.useSellerContact
                            ? 'border-emerald-200 bg-emerald-100 text-emerald-700'
                            : 'border-gray-300 bg-white text-gray-600'
                          }`}
                      >
                        <span
                          className={`relative inline-flex h-8 w-14 items-center rounded-full transition-colors ${leadRoutingForm.useSellerContact ? 'bg-emerald-500' : 'bg-gray-300'
                            }`}
                        >
                          <span
                            className={`inline-block h-6 w-6 transform rounded-full bg-white shadow-sm transition-transform ${leadRoutingForm.useSellerContact ? 'translate-x-7' : 'translate-x-1'
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
          {false && activeTab === 'payments' ? (
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
                      className={`inline-flex w-fit items-center gap-2 rounded-lg border px-3 py-1.5 text-sm font-medium ${customerPrimeForm.enabled
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

              {false && (
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
                          className={`flex min-w-[168px] items-center justify-between rounded-full border px-2 py-2 text-xs font-bold uppercase tracking-wide transition-colors ${customerPrimeForm.enabled
                              ? 'border-emerald-200 bg-emerald-100 text-emerald-700'
                              : 'border-gray-300 bg-white text-gray-600'
                            }`}
                        >
                          <span
                            className={`relative inline-flex h-8 w-14 items-center rounded-full transition-colors ${customerPrimeForm.enabled ? 'bg-emerald-500' : 'bg-gray-300'
                              }`}
                          >
                            <span
                              className={`inline-block h-6 w-6 transform rounded-full bg-white shadow-sm transition-transform ${customerPrimeForm.enabled ? 'translate-x-7' : 'translate-x-1'
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
              )}

              <section className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
                Buy Now payment controls moved to the Listings module. Open <span className="font-semibold">Listings &gt; Buy Now Payments</span> for RTGS, Razorpay, PhonePe, and receipt verification.
              </section>
            </>
          ) : null}

          {activeTab === 'invoice' ? (
            <>
              <section className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm">
                <div className="relative overflow-hidden bg-gray-900 px-6 py-8 sm:px-8">
                  <div className="absolute inset-0 bg-gradient-to-r from-gray-900 via-gray-800 to-[#FFC107]/20" />
                  <div className="relative flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-[0.3em] text-yellow-200">GST Compliance</p>
                      <h2 className="mt-2 text-3xl font-bold tracking-tight text-white">Invoice & GST Settings</h2>
                    </div>
                    <span className="inline-flex w-fit items-center gap-2 rounded-lg border border-amber-200/40 bg-amber-500/10 px-3 py-1.5 text-sm font-medium text-amber-200">
                      <FileText className="h-4 w-4" />
                      Tax Invoice Controls
                    </span>
                  </div>
                </div>
              </section>

              <section className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
                <div className="mb-6 border-b border-gray-100 pb-4">
                  <p className="text-xs font-semibold uppercase tracking-wider text-gray-500">Business Details for Invoices</p>
                  <h3 className="mt-1 text-xl font-bold text-gray-900">Company & GST Configuration</h3>
                  <p className="mt-1 text-xs text-gray-500">These details will be displayed on all customer & platform tax invoices.</p>
                </div>

                <form onSubmit={handleInvoiceSubmit} className="space-y-6">
                  <div className="grid gap-5 md:grid-cols-2">
                    <label className="block">
                      <span className="mb-1.5 block text-sm font-semibold text-gray-700">Company / Business Name</span>
                      <input
                        type="text"
                        value={companyInvoiceForm.companyName}
                        onChange={(e) => setCompanyInvoiceForm((prev) => ({ ...prev, companyName: e.target.value }))}
                        placeholder="e.g. JCB Exchange Pvt Ltd"
                        className="w-full rounded-lg border border-gray-300 bg-white px-4 py-3 text-sm text-gray-900 outline-none transition focus:border-[#FFC107] focus:ring-1 focus:ring-[#FFC107]"
                      />
                    </label>

                    <label className="block">
                      <span className="mb-1.5 block text-sm font-semibold text-gray-700">GSTIN (GST Identification Number)</span>
                      <input
                        type="text"
                        value={companyInvoiceForm.gstin}
                        onChange={(e) => setCompanyInvoiceForm((prev) => ({ ...prev, gstin: e.target.value.toUpperCase() }))}
                        placeholder="e.g. 27AAAAA0000A1Z5"
                        className="w-full rounded-lg border border-gray-300 bg-white px-4 py-3 text-sm text-gray-900 font-mono outline-none transition focus:border-[#FFC107] focus:ring-1 focus:ring-[#FFC107]"
                      />
                    </label>
                  </div>

                  <div className="grid gap-5 md:grid-cols-3">
                    <label className="block">
                      <span className="mb-1.5 block text-sm font-semibold text-gray-700">State Name</span>
                      <SearchableSelect
                        options={stateOptions}
                        value={companyInvoiceForm.state}
                        displayValue={companyInvoiceForm.state}
                        onChange={(opt) => {
                          setCompanyInvoiceForm((prev) => ({ ...prev, state: opt.name, city: '' }));
                        }}
                        placeholder="Select State"
                      />
                    </label>

                    <label className="block">
                      <span className="mb-1.5 block text-sm font-semibold text-gray-700">City</span>
                      <SearchableSelect
                        options={cityOptions}
                        value={companyInvoiceForm.city}
                        displayValue={companyInvoiceForm.city}
                        onChange={(opt) => {
                          setCompanyInvoiceForm((prev) => ({ ...prev, city: opt.name }));
                        }}
                        placeholder="Select City"
                        disabled={!companyInvoiceForm.state}
                      />
                    </label>

                    <label className="block">
                      <span className="mb-1.5 block text-sm font-semibold text-gray-700">Default GST Rate (%)</span>
                      <input
                        type="number"
                        value={companyInvoiceForm.defaultGstRate}
                        onChange={(e) => setCompanyInvoiceForm((prev) => ({ ...prev, defaultGstRate: e.target.value }))}
                        placeholder="18"
                        min="0"
                        max="28"
                        step="0.1"
                        className="w-full rounded-xl border border-gray-300 bg-white px-4 py-3 text-sm text-gray-900 outline-none transition focus:border-[#FFC107] focus:ring-2 focus:ring-[#FFC107]/20"
                      />
                    </label>
                  </div>

                  <label className="block">
                    <span className="mb-1.5 block text-sm font-semibold text-gray-700">Company Registered Address</span>
                    <textarea
                      rows={3}
                      value={companyInvoiceForm.address}
                      onChange={(e) => setCompanyInvoiceForm((prev) => ({ ...prev, address: e.target.value }))}
                      placeholder="e.g. Plot No 12, Industrial Area, Sector 5, Mumbai - 400001, Maharashtra"
                      className="w-full rounded-lg border border-gray-300 bg-white px-4 py-3 text-sm text-gray-900 outline-none transition focus:border-[#FFC107] focus:ring-1 focus:ring-[#FFC107]"
                    />
                  </label>

                  <label className="block">
                    <span className="mb-1.5 block text-sm font-semibold text-gray-700">Invoice Terms & Conditions / Note</span>
                    <textarea
                      rows={3}
                      value={companyInvoiceForm.termsAndConditions}
                      onChange={(e) => setCompanyInvoiceForm((prev) => ({ ...prev, termsAndConditions: e.target.value }))}
                      placeholder="e.g. This is a computer-generated tax invoice and does not require a physical signature."
                      className="w-full rounded-lg border border-gray-300 bg-white px-4 py-3 text-sm text-gray-900 outline-none transition focus:border-[#FFC107] focus:ring-1 focus:ring-[#FFC107]"
                    />
                  </label>

                  <div className="rounded-2xl border border-blue-100 bg-blue-50/60 p-4 text-xs leading-relaxed text-blue-900 space-y-1">
                    <p className="font-bold">Indian Standard GST Calculation Info:</p>
                    <p>• <strong>Intra-State:</strong> If Customer State equals Supplier State, tax split is divided equally into <strong>CGST ({Number(companyInvoiceForm.defaultGstRate || 18) / 2}%)</strong> and <strong>SGST ({Number(companyInvoiceForm.defaultGstRate || 18) / 2}%)</strong>.</p>
                    <p>• <strong>Inter-State:</strong> If Customer State is different, tax is applied as <strong>IGST ({companyInvoiceForm.defaultGstRate || 18}%)</strong>.</p>
                    <p>• Logo set in Site Logo Settings is automatically used as the invoice header logo.</p>
                  </div>

                  <div className="flex justify-end border-t border-gray-100 pt-4">
                    <button
                      type="submit"
                      disabled={invoiceSaving}
                      className="inline-flex items-center gap-2 rounded-xl bg-[#FFC107] px-6 py-3 text-sm font-bold text-black shadow-sm transition hover:bg-[#E5AD06] disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      <Save className="h-4 w-4" />
                      {invoiceSaving ? 'Saving...' : 'Save Invoice & GST Settings'}
                    </button>
                  </div>
                </form>
              </section>

            </>
          ) : null}
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
                      className={`inline-flex w-fit items-center gap-2 rounded-lg border px-3 py-1.5 text-sm font-medium ${customerPrimeForm.enabled
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
                        className={`flex min-w-[168px] items-center justify-between rounded-full border px-2 py-2 text-xs font-bold uppercase tracking-wide transition-colors ${customerPrimeForm.enabled
                            ? 'border-emerald-200 bg-emerald-100 text-emerald-700'
                            : 'border-gray-300 bg-white text-gray-600'
                          }`}
                      >
                        <span
                          className={`relative inline-flex h-8 w-14 items-center rounded-full transition-colors ${customerPrimeForm.enabled ? 'bg-emerald-500' : 'bg-gray-300'
                            }`}
                        >
                          <span
                            className={`inline-block h-6 w-6 transform rounded-full bg-white shadow-sm transition-transform ${customerPrimeForm.enabled ? 'translate-x-7' : 'translate-x-1'
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

              <section className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
                <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between border-b border-gray-100 pb-4">
                  <div>
                    <p className="text-xs font-bold uppercase tracking-wider text-amber-600">Listing Buy Payments</p>
                    <h3 className="mt-1 text-2xl font-bold text-gray-900">RTGS, Razorpay, and PhonePe Configuration</h3>
                  </div>
                  <span className="inline-flex w-fit items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3.5 py-1.5 text-xs font-bold text-amber-800">
                    <Building2 className="h-4 w-4 text-amber-600" />
                    Buy Now Gateway
                  </span>
                </div>

                <form onSubmit={handleListingPaymentSubmit} className="space-y-8">
                  {/* RTGS / Bank Transfer Row Box */}
                  <div className="rounded-2xl border border-gray-200 bg-gray-50/60 p-5 sm:p-6 shadow-xs">
                    <div className="mb-5 flex items-center justify-between gap-4 border-b border-gray-200/80 pb-4">
                      <div>
                        <h4 className="text-base font-bold text-gray-900">RTGS / Bank Transfer</h4>
                        <p className="mt-0.5 text-xs font-medium text-gray-500">Shown to customer after Buy Now click for manual bank transfer.</p>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className={`text-xs font-bold ${rtgsIsIncomplete
                            ? 'text-amber-700'
                            : listingPaymentForm.rtgs.enabled
                              ? 'text-emerald-700'
                              : 'text-gray-500'
                          }`}>
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

                  {/* Razorpay Row Box */}
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
                        <span className={`inline-flex rounded-full px-3 py-1 text-xs font-bold ${detectedRazorpayMode === 'LIVE'
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
                        key={`razorpay-key-secret-${isMaskedSecretValue(listingPaymentForm.razorpay.keySecret) ? 'masked' : 'editable'}`}
                        label="Key Secret"
                        type="password"
                        value={razorpayFieldsDisabled ? '' : listingPaymentForm.razorpay.keySecret}
                        onChange={(value) => updateListingPaymentForm({ razorpay: { keySecret: value } })}
                        disabled={razorpayFieldsDisabled}
                        placeholder={razorpayFieldsDisabled ? 'Enable Razorpay to add secret' : 'Leave masked value to keep existing secret'}
                        onReveal={() => revealSecret('razorpayKeySecret')}
                        isRevealing={revealingSecret === 'razorpayKeySecret'}
                      />
                      <SettingsInput
                        key={`razorpay-webhook-secret-${isMaskedSecretValue(listingPaymentForm.razorpay.webhookSecret) ? 'masked' : 'editable'}`}
                        label="Webhook Secret"
                        type="password"
                        value={razorpayFieldsDisabled ? '' : listingPaymentForm.razorpay.webhookSecret}
                        onChange={(value) => updateListingPaymentForm({ razorpay: { webhookSecret: value } })}
                        disabled={razorpayFieldsDisabled}
                        placeholder={razorpayFieldsDisabled ? 'Enable Razorpay to add webhook secret' : 'Optional'}
                        onReveal={() => revealSecret('razorpayWebhookSecret')}
                        isRevealing={revealingSecret === 'razorpayWebhookSecret'}
                      />
                    </div>
                  </div>

                  {/* PhonePe Row Box */}
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
                        <span className={`inline-flex rounded-full px-3 py-1 text-xs font-bold ${phonePeFieldsDisabled
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
                        key={`phonepe-client-secret-${isMaskedSecretValue(listingPaymentForm.phonepe.clientSecret) ? 'masked' : 'editable'}`}
                        label="Client Secret"
                        type="password"
                        value={phonePeFieldsDisabled ? '' : listingPaymentForm.phonepe.clientSecret}
                        onChange={(value) => updateListingPaymentForm({ phonepe: { clientSecret: value } })}
                        disabled={phonePeFieldsDisabled}
                        placeholder={phonePeFieldsDisabled ? 'Enable PhonePe to add secret' : 'Leave masked value to keep existing secret'}
                        onReveal={() => revealSecret('phonepeClientSecret')}
                        isRevealing={revealingSecret === 'phonepeClientSecret'}
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
            </>
          ) : null}

          {activeTab === 'googleDrive' ? (
            <section className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm">
              <div className="relative overflow-hidden bg-gray-900 px-6 py-8 sm:px-8">
                <div className="relative flex items-center justify-between">
                  <div>
                    <h2 className="mt-2 text-3xl font-bold tracking-tight text-white">Google Drive Integration</h2>
                    <p className="mt-2 text-sm text-gray-300 max-w-xl">
                      Configure your Google Drive API credentials here. This is used for uploading listings, logos, and daily database backups to your personal Google Drive storage instead of keeping them on local servers.
                    </p>
                  </div>
                </div>
              </div>
              <div className="p-6 sm:p-8">
                <form onSubmit={handleGoogleDriveSubmit} className="space-y-6">
                  <div className="grid gap-6 md:grid-cols-2">
                    <div className="block">
                      <span className="mb-1.5 block text-sm font-semibold text-gray-700">Google Client ID</span>
                      <div className="relative">
                        <input
                          type={showGoogleDriveClientId ? 'text' : 'password'}
                          value={googleDriveSettings.clientId}
                          onChange={(e) => setGoogleDriveSettings({ ...googleDriveSettings, clientId: e.target.value })}
                          placeholder="Client ID"
                          autoComplete="new-password"
                          className="w-full rounded-lg border border-gray-300 bg-white px-4 py-3 pr-11 text-sm text-gray-900 outline-none transition focus:border-[#FFC107] focus:ring-1 focus:ring-[#FFC107]"
                        />
                        <button
                          type="button"
                          onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            setShowGoogleDriveClientId((current) => !current);
                          }}
                          className="absolute inset-y-0 right-0 flex items-center pr-3 text-gray-500 hover:text-gray-700 focus:outline-none transition"
                          aria-label={showGoogleDriveClientId ? 'Hide Google client ID' : 'Show Google client ID'}
                        >
                          {showGoogleDriveClientId ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                        </button>
                      </div>
                    </div>
                    <div className="block">
                      <span className="mb-1.5 block text-sm font-semibold text-gray-700">Google Client Secret</span>
                      <div className="relative">
                        <input
                          type={showGoogleDriveClientSecret ? 'text' : 'password'}
                          value={googleDriveSettings.clientSecret}
                          onChange={(e) => setGoogleDriveSettings({ ...googleDriveSettings, clientSecret: e.target.value })}
                          placeholder="Client Secret"
                          autoComplete="new-password"
                          className="w-full rounded-lg border border-gray-300 bg-white px-4 py-3 pr-11 text-sm text-gray-900 outline-none transition focus:border-[#FFC107] focus:ring-1 focus:ring-[#FFC107]"
                        />
                        <button
                          type="button"
                          onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            setShowGoogleDriveClientSecret((current) => !current);
                          }}
                          className="absolute inset-y-0 right-0 flex items-center pr-3 text-gray-500 hover:text-gray-700 focus:outline-none transition"
                          aria-label={showGoogleDriveClientSecret ? 'Hide Google client secret' : 'Show Google client secret'}
                        >
                          {showGoogleDriveClientSecret ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                        </button>
                      </div>
                    </div>
                    <div className="block md:col-span-2">
                      <span className="mb-1.5 block text-sm font-semibold text-gray-700">Refresh Token</span>
                      <div className="relative">
                        <input
                          type={showGoogleDriveRefreshToken ? 'text' : 'password'}
                          value={googleDriveSettings.refreshToken}
                          onChange={(e) => setGoogleDriveSettings({ ...googleDriveSettings, refreshToken: e.target.value })}
                          placeholder="Refresh Token (from OAuth2 Playground)"
                          autoComplete="new-password"
                          className="w-full rounded-lg border border-gray-300 bg-white px-4 py-3 pr-11 text-sm text-gray-900 outline-none transition focus:border-[#FFC107] focus:ring-1 focus:ring-[#FFC107]"
                        />
                        <button
                          type="button"
                          onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            setShowGoogleDriveRefreshToken((current) => !current);
                          }}
                          className="absolute inset-y-0 right-0 flex items-center pr-3 text-gray-500 hover:text-gray-700 focus:outline-none transition"
                          aria-label={showGoogleDriveRefreshToken ? 'Hide refresh token' : 'Show refresh token'}
                        >
                          {showGoogleDriveRefreshToken ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                        </button>
                      </div>
                    </div>
                    <label className="block md:col-span-2">
                      <span className="mb-1.5 block text-sm font-semibold text-gray-700">Database Backup Folder ID (Optional)</span>
                      <input
                        type="text"
                        value={googleDriveSettings.backupFolderId}
                        onChange={(e) => setGoogleDriveSettings({ ...googleDriveSettings, backupFolderId: e.target.value })}
                        placeholder="e.g. 1A2B3C4D5E6F7G8H9I0J"
                        className="w-full rounded-lg border border-gray-300 bg-white px-4 py-3 text-sm text-gray-900 outline-none transition focus:border-[#FFC107] focus:ring-1 focus:ring-[#FFC107]"
                      />
                      <p className="mt-1 text-xs text-gray-500">
                        Leave blank to upload daily CSV backups to the root directory of your Google Drive.
                      </p>
                    </label>
                  </div>
                  <div className="flex justify-end">
                    <button
                      type="submit"
                      disabled={googleDriveSaving}
                      className="inline-flex items-center gap-2 rounded-lg bg-[#FFC107] px-6 py-2.5 text-sm font-semibold text-black transition hover:bg-[#E5AD06] disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      <Save className="h-4 w-4" />
                      {googleDriveSaving ? 'Saving...' : 'Save Drive Settings'}
                    </button>
                  </div>
                </form>
              </div>
            </section>
          ) : null}

          {activeTab === 'mobileApp' ? (
            <section className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
              <div className="mb-6">
                <p className="text-xs font-semibold uppercase tracking-wider text-gray-500">Mobile Settings</p>
                <h3 className="mt-1 text-xl font-bold text-gray-900">Mobile App Links</h3>
              </div>
              <form onSubmit={handleMobileAppSubmit} className="space-y-6">
                <div className="grid gap-5 md:grid-cols-2">
                  <label className="block">
                    <span className="mb-1.5 block text-sm font-semibold text-gray-700">Play Store Link</span>
                    <input
                      type="url"
                      value={mobileAppForm.playStoreLink}
                      onChange={(e) => updateMobileAppForm({ playStoreLink: e.target.value })}
                      placeholder="https://play.google.com/store/apps/details?id=..."
                      className="w-full rounded-lg border border-gray-300 bg-white px-4 py-3 text-sm text-gray-900 outline-none transition focus:border-[#FFC107] focus:ring-1 focus:ring-[#FFC107]"
                    />
                  </label>
                  <label className="block">
                    <span className="mb-1.5 block text-sm font-semibold text-gray-700">App Store Link</span>
                    <input
                      type="url"
                      value={mobileAppForm.appStoreLink}
                      onChange={(e) => updateMobileAppForm({ appStoreLink: e.target.value })}
                      placeholder="https://apps.apple.com/app/..."
                      className="w-full rounded-lg border border-gray-300 bg-white px-4 py-3 text-sm text-gray-900 outline-none transition focus:border-[#FFC107] focus:ring-1 focus:ring-[#FFC107]"
                    />
                  </label>
                </div>
                <div className="flex justify-end border-t border-gray-100 pt-4">
                  <button
                    type="submit"
                    disabled={mobileAppSaving}
                    className="inline-flex items-center gap-2 rounded-lg bg-[#FFC107] px-6 py-2.5 text-sm font-semibold text-black transition hover:bg-[#E5AD06] disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    <Save className="h-4 w-4" />
                    {mobileAppSaving ? 'Saving...' : 'Save App Links'}
                  </button>
                </div>
              </form>
            </section>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function SettingsInput({
  label,
  value,
  onChange,
  type = 'text',
  disabled = false,
  placeholder,
  onReveal,
  isRevealing = false,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: 'text' | 'password';
  disabled?: boolean;
  placeholder?: string;
  onReveal?: () => Promise<string | null>;
  isRevealing?: boolean;
}) {
  const [show, setShow] = useState(false);
  const [revealedValue, setRevealedValue] = useState<string | null>(null);
  const isSecret = type === 'password';
  const isMasked = isSecret && isMaskedSecretValue(value);

  const handleVisibilityToggle = async () => {
    if (!show && isMasked && onReveal && !revealedValue) {
      const nextValue = await onReveal();
      if (!nextValue) {
        return;
      }
      setRevealedValue(nextValue);
    }

    setShow((current) => !current);
  };

  return (
    <label className="block">
      <span className="mb-1.5 block text-sm font-semibold text-gray-700">{label}</span>
      <div className="relative">
        <input
          type={isSecret && !show ? 'password' : 'text'}
          value={show ? (revealedValue || value) : value}
          disabled={disabled}
          placeholder={placeholder}
          autoComplete={isSecret ? 'new-password' : undefined}
          onChange={(event) => {
            setRevealedValue(null);
            onChange(event.target.value);
          }}
          className={`w-full rounded-lg border border-gray-300 bg-white px-4 py-3 text-sm text-gray-900 outline-none transition focus:border-[#FFC107] focus:ring-1 focus:ring-[#FFC107] disabled:cursor-not-allowed disabled:bg-gray-100 disabled:text-gray-400 ${isSecret ? 'pr-11' : ''}`}
        />
        {isSecret ? (
          <button
            type="button"
            disabled={disabled || isRevealing}
            onClick={() => void handleVisibilityToggle()}
            className="absolute inset-y-0 right-0 flex items-center px-3 text-gray-500 transition hover:text-gray-800 disabled:cursor-not-allowed disabled:opacity-50"
            aria-label={isRevealing ? `Loading ${label}` : show ? `Hide ${label}` : `Show ${label}`}
          >
            {isRevealing ? <span className="text-[10px] font-bold">…</span> : show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
          </button>
        ) : null}
      </div>
    </label>
  );
}

