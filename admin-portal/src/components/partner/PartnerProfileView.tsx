'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import type { AxiosError } from 'axios';
import {
  BadgeCheck,
  CheckCircle2,
  Clock,
  Download,
  KeyRound,
  Mail,
  MapPin,
  Phone,
  Save,
  Shield,
  Building2,
  Globe,
  FileText,
  AlertCircle,
  ExternalLink,
  Check,
  Sparkles,
} from 'lucide-react';
import api from '@/lib/api';
import BrandLoader from '@/components/ui/BrandLoader';
import { formatPartnerTypeLabel } from '@/lib/partnerType';
import { useAuthStore } from '@/store/authStore';
import SearchableSelect, { type Option } from '@/components/ui/SearchableSelect';
import AvatarUpload from '@/components/profile/AvatarUpload';

type PartnerProfileFormState = {
  ownerName: string;
  businessName: string;
  email: string;
  mobile: string;
  whatsappNumber: string;
  state: string;
  district: string;
  city: string;
  pinCode: string;
  businessAddress: string;
  websiteUrl: string;
  googleMapsLocation: string;
  serviceAreas: string;
};

type PasswordFormState = {
  newPassword: string;
  confirmPassword: string;
};

type PartnerOnboardingProfile = {
  ownerName: string;
  businessName: string;
  partnerType: string;
  primaryContact: string;
  alternateMobile?: string;
  whatsappNumber: string;
  email: string;
  state: string;
  district: string;
  city: string;
  pinCode: string;
  businessAddress: string;
  googleMapsLocation: string;
  businessDescription?: string;
  businessExperience?: string;
  expectedMonthlyListings?: string | number;
  websiteUrl: string;
  serviceAreas: string;
  workingHours?: string;
  gstNumber?: string;
  businessRegistrationNumber?: string;
  socialLinks?: string;
  yearsInBusiness?: string | number;
  teamSize?: string | number;
  contactPreference?: string;
  referralCode?: string;
};

type PartnerKycDocument = {
  documentType: string;
  fileUrl?: string;
  fileName?: string;
  documentNumber?: string;
  status?: string;
  reviewComment?: string;
};

type PartnerReviewHistory = {
  id: string;
  action: string;
  comment?: string;
  createdAt: string;
};

type PartnerAgreement = {
  agreementType: string;
  checked: boolean;
};

type PartnerOnboardingPayload = {
  profile: PartnerOnboardingProfile;
  kycDocuments: PartnerKycDocument[];
  reviewHistory: PartnerReviewHistory[];
  agreements: PartnerAgreement[];
  progress: {
    profileComplete: boolean;
    documentsComplete: boolean;
    agreementsComplete: boolean;
    readyForSubmission: boolean;
  };
};

const emptyPasswordForm: PasswordFormState = {
  newPassword: '',
  confirmPassword: '',
};

const formatLabel = (value?: string | null) =>
  value
    ? value
        .toLowerCase()
        .split('_')
        .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
        .join(' ')
    : '-';

const getApiErrorMessage = (error: unknown, fallbackMessage: string) => {
  const axiosError = error as AxiosError<{ error?: string }>;
  return axiosError.response?.data?.error || fallbackMessage;
};

const statusBadgeClassName = (status?: string | null) => {
  switch (status) {
    case 'ACTIVE':
    case 'APPROVED':
    case 'VERIFIED':
      return 'border-emerald-300/80 bg-emerald-50 text-emerald-800';
    case 'PENDING':
    case 'REVIEW_PENDING':
    case 'VERIFICATION_PENDING':
    case 'SUBMITTED':
      return 'border-amber-300/80 bg-amber-50 text-amber-800';
    case 'REJECTED':
    case 'BLOCKED':
    case 'SUSPENDED':
      return 'border-rose-300/80 bg-rose-50 text-rose-800';
    default:
      return 'border-slate-300/80 bg-slate-50 text-slate-700';
  }
};

export default function PartnerProfileView() {
  const { user, updateUser, setAuth } = useAuthStore();
  const [profileForm, setProfileForm] = useState<PartnerProfileFormState>({
    ownerName: '',
    businessName: '',
    email: '',
    mobile: '',
    whatsappNumber: '',
    state: '',
    district: '',
    city: '',
    pinCode: '',
    businessAddress: '',
    websiteUrl: '',
    googleMapsLocation: '',
    serviceAreas: '',
  });
  const [passwordForm, setPasswordForm] = useState<PasswordFormState>(emptyPasswordForm);
  const [partnerData, setPartnerData] = useState<PartnerOnboardingPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [savingProfile, setSavingProfile] = useState(false);
  const [savingPassword, setSavingPassword] = useState(false);
  const [profileMessage, setProfileMessage] = useState<string | null>(null);
  const [passwordMessage, setPasswordMessage] = useState<string | null>(null);
  const [profileError, setProfileError] = useState<string | null>(null);
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [states, setStates] = useState<Option[]>([]);
  const [cities, setCities] = useState<Option[]>([]);
  const [selectedStateId, setSelectedStateId] = useState('');
  const [selectedCityId, setSelectedCityId] = useState('');

  const handlePrint = () => {
    if (typeof window !== 'undefined') {
      window.print();
    }
  };

  const loadCities = useCallback(async (stateId: string, cityName?: string) => {
    if (!stateId) {
      setCities([]);
      setSelectedCityId('');
      return;
    }

    try {
      const response = await api.get<Option[]>(`/locations/cities/${stateId}`);
      const nextCities = response.data || [];
      setCities(nextCities);

      if (cityName) {
        const matchedCity = nextCities.find(
          (option) => option.name.toLowerCase() === cityName.toLowerCase(),
        );
        setSelectedCityId(matchedCity ? String(matchedCity.id) : '');
      } else {
        setSelectedCityId('');
      }
    } catch (error) {
      console.error('Failed to load profile cities', error);
      setCities([]);
      setSelectedCityId('');
    }
  }, []);

  useEffect(() => {
    const loadProfile = async () => {
      setLoading(true);
      setProfileError(null);

      try {
        const [profileResponse, onboardingResponse] = await Promise.all([
          api.get('/auth/profile'),
          api.get('/auth/partner/onboarding'),
        ]);

        updateUser(profileResponse.data.user);
        const onboarding = onboardingResponse.data as PartnerOnboardingPayload;
        setPartnerData(onboarding);
        setProfileForm({
          ownerName: onboarding.profile.ownerName || '',
          businessName: onboarding.profile.businessName || '',
          email: onboarding.profile.email || '',
          mobile: onboarding.profile.primaryContact || '',
          whatsappNumber: onboarding.profile.whatsappNumber || '',
          state: onboarding.profile.state || '',
          district: onboarding.profile.district || '',
          city: onboarding.profile.city || '',
          pinCode: onboarding.profile.pinCode || '',
          businessAddress: onboarding.profile.businessAddress || '',
          websiteUrl: onboarding.profile.websiteUrl || '',
          googleMapsLocation: onboarding.profile.googleMapsLocation || '',
          serviceAreas: onboarding.profile.serviceAreas || '',
        });

        const countriesResponse = await api.get<Option[]>('/locations/countries');
        const india = (countriesResponse.data || []).find((option) => option.name === 'India');

        if (!india) {
          setStates([]);
          setCities([]);
          setSelectedStateId('');
          setSelectedCityId('');
          return;
        }

        const statesResponse = await api.get<Option[]>(`/locations/states/${india.id}`);
        const nextStates = statesResponse.data || [];
        setStates(nextStates);

        const matchedState = nextStates.find(
          (option) => option.name.toLowerCase() === (onboarding.profile.state || '').toLowerCase(),
        );

        if (matchedState) {
          const matchedStateId = String(matchedState.id);
          setSelectedStateId(matchedStateId);
          await loadCities(matchedStateId, onboarding.profile.city || '');
        } else {
          setSelectedStateId('');
          setCities([]);
          setSelectedCityId('');
        }
      } catch (error: unknown) {
        setProfileError(getApiErrorMessage(error, 'Unable to load partner profile.'));
      } finally {
        setLoading(false);
      }
    };

    void loadProfile();
  }, [loadCities, updateUser]);

  const onboardingChecklist = useMemo(() => {
    if (!partnerData) {
      return [];
    }

    return [
      { label: 'Account details verified', done: partnerData.progress.profileComplete },
      { label: 'KYC documents validated', done: partnerData.progress.documentsComplete },
      { label: 'Compliance & agreements accepted', done: partnerData.progress.agreementsComplete },
    ];
  }, [partnerData]);

  const completionPercentage = useMemo(() => {
    if (!onboardingChecklist.length) return 0;
    const completed = onboardingChecklist.filter((item) => item.done).length;
    return Math.round((completed / onboardingChecklist.length) * 100);
  }, [onboardingChecklist]);

  if (loading) {
    return (
      <BrandLoader variant="section" size="md" bg="light" text="Loading partner profile..." className="rounded-[24px] border border-slate-200 bg-white shadow-[0_24px_60px_-38px_rgba(15,23,42,0.25)]" />
    );
  }

  const handleProfileSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSavingProfile(true);
    setProfileError(null);
    setProfileMessage(null);

    try {
      const response = await api.patch('/auth/profile', profileForm);
      if (response.data.token && response.data.user) {
        setAuth(response.data.token, response.data.user);
      } else {
        updateUser(response.data.user);
      }

      setPartnerData((current) =>
        current
          ? {
              ...current,
              profile: {
                ...current.profile,
                ownerName: profileForm.ownerName,
                businessName: profileForm.businessName,
                email: profileForm.email,
                primaryContact: profileForm.mobile,
                whatsappNumber: profileForm.whatsappNumber,
                state: profileForm.state,
                district: profileForm.district,
                city: profileForm.city,
                pinCode: profileForm.pinCode,
                businessAddress: profileForm.businessAddress,
                websiteUrl: profileForm.websiteUrl,
                googleMapsLocation: profileForm.googleMapsLocation,
                serviceAreas: profileForm.serviceAreas,
              },
            }
          : current
      );

      setProfileMessage(response.data.message || 'Profile changes saved successfully.');
    } catch (error: unknown) {
      setProfileError(getApiErrorMessage(error, 'Unable to update partner profile.'));
    } finally {
      setSavingProfile(false);
    }
  };

  const handlePasswordSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSavingPassword(true);
    setPasswordError(null);
    setPasswordMessage(null);

    try {
      const response = await api.patch('/auth/profile/password', passwordForm);
      if (response.data.token && response.data.user) {
        setAuth(response.data.token, response.data.user);
      }
      setPasswordForm(emptyPasswordForm);
      setPasswordMessage(response.data.message || 'Password changed successfully.');
    } catch (error: unknown) {
      setPasswordError(getApiErrorMessage(error, 'Unable to update password.'));
    } finally {
      setSavingPassword(false);
    }
  };

  const handleStateChange = async (option: Option) => {
    const nextStateId = String(option.id);
    setProfileForm((current) => ({
      ...current,
      state: option.name,
      city: '',
    }));
    setSelectedStateId(nextStateId);
    setSelectedCityId('');
    await loadCities(nextStateId);
  };

  const handleCityChange = (option: Option) => {
    setProfileForm((current) => ({
      ...current,
      city: option.name,
    }));
    setSelectedCityId(String(option.id));
  };

  return (
    <div className="profile-print-target w-full mx-auto max-w-7xl space-y-5">
      {/* 1. EXECUTIVE HERO BANNER */}
      <section className="profile-no-print relative overflow-hidden rounded-2xl border border-slate-800 bg-gradient-to-r from-slate-950 via-slate-900 to-[#18181b] p-5 sm:p-6 text-white shadow-md">
        <div className="absolute -right-16 -top-16 h-64 w-64 rounded-full bg-amber-500/10 blur-3xl pointer-events-none" />
        <div className="absolute right-1/3 -bottom-16 h-48 w-48 rounded-full bg-amber-400/5 blur-2xl pointer-events-none" />

        <div className="relative flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-4">
            <div className="relative rounded-2xl p-1 bg-white/5 border border-white/10 ring-2 ring-amber-400/20 shadow-inner">
              <AvatarUpload user={user} onUploaded={updateUser} size="profile" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="inline-flex items-center gap-1 rounded-md bg-amber-400/15 border border-amber-400/30 px-2 py-0.5 text-[10px] font-black uppercase tracking-wider text-amber-300">
                  <Shield className="h-3 w-3 text-amber-400" />
                  {formatPartnerTypeLabel(user?.partnerType, 'Authorized Partner')}
                </span>
                <span className="inline-flex items-center gap-1 rounded-md bg-emerald-500/15 border border-emerald-500/30 px-2 py-0.5 text-[10px] font-bold text-emerald-300">
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
                  {formatLabel(user?.accountStatus || 'ACTIVE')}
                </span>
              </div>

              <h1 className="mt-1.5 text-xl sm:text-2xl font-black tracking-tight text-white">
                {profileForm.businessName || user?.name || 'Partner Account'}
              </h1>

              <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-300">
                <span className="font-semibold text-slate-200">
                  {profileForm.ownerName || user?.ownerName || 'Account Lead'}
                </span>
                {profileForm.email && (
                  <span className="flex items-center gap-1 text-slate-400">
                    <Mail className="h-3.5 w-3.5 text-slate-500" />
                    {profileForm.email}
                  </span>
                )}
                {profileForm.mobile && (
                  <span className="flex items-center gap-1 text-slate-400">
                    <Phone className="h-3.5 w-3.5 text-slate-500" />
                    {profileForm.mobile}
                  </span>
                )}
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 self-start sm:self-center">
            <button
              type="button"
              onClick={handlePrint}
              className="inline-flex items-center gap-1.5 rounded-xl bg-amber-400 hover:bg-amber-300 text-slate-950 px-3.5 py-2 text-xs font-bold shadow-sm shadow-amber-400/20 active:scale-95 transition-all"
            >
              <Download className="h-3.5 w-3.5" />
              Download PDF Profile
            </button>
          </div>
        </div>
      </section>

      {/* 2. PRINT-ONLY SHEET */}
      <section className="profile-print-only rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Official Partner Profile Summary</p>
        <h3 className="mt-1 text-2xl font-bold text-slate-900">{profileForm.businessName || user?.name || 'Partner Account'}</h3>
        <p className="mt-1 text-sm text-slate-500">{profileForm.ownerName || user?.ownerName || '-'}</p>

        <div className="mt-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">Partner type</p>
            <p className="mt-1 text-sm font-semibold text-slate-900">{formatPartnerTypeLabel(user?.partnerType, '-')}</p>
          </div>
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">Account status</p>
            <p className="mt-1 text-sm font-semibold text-slate-900">{formatLabel(user?.accountStatus)}</p>
          </div>
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">KYC status</p>
            <p className="mt-1 text-sm font-semibold text-slate-900">{formatLabel(user?.kycStatus)}</p>
          </div>
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">Contact</p>
            <p className="mt-1 text-sm font-semibold text-slate-900">{profileForm.mobile || profileForm.whatsappNumber || '-'}</p>
          </div>
        </div>

        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">Location</p>
            <p className="mt-1 text-sm font-semibold text-slate-900">{[profileForm.city, profileForm.district, profileForm.state].filter(Boolean).join(', ') || '-'}</p>
          </div>
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">Business address</p>
            <p className="mt-1 text-sm font-semibold text-slate-900">{profileForm.businessAddress || '-'}</p>
          </div>
        </div>

        <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">KYC documents</p>
            <p className="mt-1 text-sm font-semibold text-slate-900">{partnerData?.kycDocuments?.length || 0}</p>
          </div>
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">Agreements</p>
            <p className="mt-1 text-sm font-semibold text-slate-900">{partnerData?.agreements?.length || 0}</p>
          </div>
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">Website</p>
            <p className="mt-1 break-words text-sm font-semibold text-slate-900">{profileForm.websiteUrl || '-'}</p>
          </div>
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">Google Maps</p>
            <p className="mt-1 break-words text-sm font-semibold text-slate-900">{profileForm.googleMapsLocation || '-'}</p>
          </div>
        </div>
      </section>

      {/* 3. MAIN WORKSPACE GRID */}
      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_340px]">
        {/* LEFT COLUMN: FORMS */}
        <div className="space-y-5 profile-no-print">
          {/* BUSINESS PROFILE FORM CARD */}
          <div className="rounded-2xl border border-slate-200/90 bg-white p-5 sm:p-6 shadow-sm">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between pb-4 border-b border-slate-100 gap-2">
              <div>
                <div className="flex items-center gap-2">
                  <div className="h-7 w-7 rounded-lg bg-amber-500/10 text-amber-600 flex items-center justify-center font-bold text-xs">
                    <Building2 className="h-4 w-4" />
                  </div>
                  <h2 className="text-sm font-bold text-slate-900">Business Profile & Operating Details</h2>
                </div>
                <p className="mt-1 text-xs text-slate-500">
                  Update your official company identity, direct communication handles, and operational coverage.
                </p>
              </div>
            </div>

            {profileError && (
              <div className="mt-4 flex items-center gap-2 rounded-xl border border-rose-200 bg-rose-50 px-3.5 py-2.5 text-xs font-semibold text-rose-700">
                <AlertCircle className="h-4 w-4 shrink-0 text-rose-500" />
                <span>{profileError}</span>
              </div>
            )}
            {profileMessage && (
              <div className="mt-4 flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-3.5 py-2.5 text-xs font-semibold text-emerald-800">
                <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" />
                <span>{profileMessage}</span>
              </div>
            )}

            <form className="mt-5 space-y-5" onSubmit={handleProfileSubmit}>
              {/* SUBSECTION: IDENTITY */}
              <div>
                <p className="text-[10px] font-black uppercase tracking-wider text-slate-400 mb-3 flex items-center gap-1.5">
                  <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />
                  Identity & Partner Classification
                </p>
                <div className="grid gap-3.5 sm:grid-cols-2">
                  <div>
                    <label className="block text-[11px] font-bold text-slate-700 mb-1">
                      Owner / Representative Name
                    </label>
                    <input data-sanitize="name"
                      type="text"
                      value={profileForm.ownerName}
                      onChange={(event) => setProfileForm((current) => ({ ...current, ownerName: event.target.value }))}
                      className="w-full rounded-xl border border-slate-200/90 bg-slate-50/70 px-3.5 py-2 text-xs font-semibold text-slate-900 outline-none transition focus:border-amber-400 focus:bg-white focus:ring-2 focus:ring-amber-400/20 placeholder:text-slate-400"
                      placeholder="e.g. Rajesh Kumar"
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] font-bold text-slate-700 mb-1">
                      Registered Business / Firm Name
                    </label>
                    <input
                      type="text"
                      value={profileForm.businessName}
                      onChange={(event) => setProfileForm((current) => ({ ...current, businessName: event.target.value }))}
                      className="w-full rounded-xl border border-slate-200/90 bg-slate-50/70 px-3.5 py-2 text-xs font-semibold text-slate-900 outline-none transition focus:border-amber-400 focus:bg-white focus:ring-2 focus:ring-amber-400/20 placeholder:text-slate-400"
                      placeholder="e.g. Apex Heavy Machinery Solutions"
                    />
                  </div>

                  <div className="sm:col-span-2">
                    <label className="block text-[11px] font-bold text-slate-700 mb-1">
                      Assigned Partner Type <span className="text-[10px] font-normal text-slate-400">(Managed by Platform)</span>
                    </label>
                    <div className="w-full rounded-xl border border-slate-200 bg-slate-100/70 px-3.5 py-2 text-xs font-semibold text-slate-700 flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Shield className="h-3.5 w-3.5 text-amber-600" />
                        <span>{formatPartnerTypeLabel(user?.partnerType, '-')}</span>
                      </div>
                      <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Verified Category</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* SUBSECTION: CONTACT DETAILS */}
              <div className="pt-2 border-t border-slate-100">
                <p className="text-[10px] font-black uppercase tracking-wider text-slate-400 mb-3 flex items-center gap-1.5">
                  <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />
                  Direct Communication Channels
                </p>
                <div className="grid gap-3.5 sm:grid-cols-3">
                  <div>
                    <label className="block text-[11px] font-bold text-slate-700 mb-1">
                      Official Email Address
                    </label>
                    <input
                      type="email"
                      value={profileForm.email}
                      onChange={(event) => setProfileForm((current) => ({ ...current, email: event.target.value }))}
                      className="w-full rounded-xl border border-slate-200/90 bg-slate-50/70 px-3.5 py-2 text-xs font-semibold text-slate-900 outline-none transition focus:border-amber-400 focus:bg-white focus:ring-2 focus:ring-amber-400/20 placeholder:text-slate-400"
                      placeholder="partner@company.com"
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] font-bold text-slate-700 mb-1">
                      Primary Mobile Number
                    </label>
                    <input data-sanitize="mobile"
                      type="text"
                      value={profileForm.mobile}
                      onChange={(event) => setProfileForm((current) => ({ ...current, mobile: event.target.value }))}
                      className="w-full rounded-xl border border-slate-200/90 bg-slate-50/70 px-3.5 py-2 text-xs font-semibold text-slate-900 outline-none transition focus:border-amber-400 focus:bg-white focus:ring-2 focus:ring-amber-400/20 placeholder:text-slate-400"
                      placeholder="+91 98765 43210"
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] font-bold text-slate-700 mb-1">
                      WhatsApp Dispatch Number
                    </label>
                    <input data-sanitize="mobile"
                      type="text"
                      value={profileForm.whatsappNumber}
                      onChange={(event) => setProfileForm((current) => ({ ...current, whatsappNumber: event.target.value }))}
                      className="w-full rounded-xl border border-slate-200/90 bg-slate-50/70 px-3.5 py-2 text-xs font-semibold text-slate-900 outline-none transition focus:border-amber-400 focus:bg-white focus:ring-2 focus:ring-amber-400/20 placeholder:text-slate-400"
                      placeholder="+91 98765 43210"
                    />
                  </div>
                </div>
              </div>

              {/* SUBSECTION: OPERATING ADDRESS & REGION */}
              <div className="pt-2 border-t border-slate-100">
                <p className="text-[10px] font-black uppercase tracking-wider text-slate-400 mb-3 flex items-center gap-1.5">
                  <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />
                  Operating Address & Geo Location
                </p>
                <div className="grid gap-3.5 sm:grid-cols-2 lg:grid-cols-4">
                  <div>
                    <label className="block text-[11px] font-bold text-slate-700 mb-1">
                      State / Province
                    </label>
                    <SearchableSelect
                      options={states}
                      value={selectedStateId || profileForm.state}
                      displayValue={profileForm.state}
                      onChange={(option) => { void handleStateChange(option); }}
                      placeholder="Select state"
                      className="bg-white"
                      size="sm"
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] font-bold text-slate-700 mb-1">
                      District
                    </label>
                    <input
                      type="text"
                      value={profileForm.district}
                      onChange={(event) => setProfileForm((current) => ({ ...current, district: event.target.value }))}
                      className="w-full rounded-xl border border-slate-200/90 bg-slate-50/70 px-3.5 py-2 text-xs font-semibold text-slate-900 outline-none transition focus:border-amber-400 focus:bg-white focus:ring-2 focus:ring-amber-400/20 placeholder:text-slate-400"
                      placeholder="e.g. Pune"
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] font-bold text-slate-700 mb-1">
                      City / Hub
                    </label>
                    <SearchableSelect
                      options={selectedStateId ? cities : []}
                      value={selectedCityId || profileForm.city}
                      displayValue={profileForm.city}
                      onChange={handleCityChange}
                      placeholder={selectedStateId ? 'Select city' : 'Select state first'}
                      disabled={!selectedStateId}
                      className="bg-white"
                      size="sm"
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] font-bold text-slate-700 mb-1">
                      PIN Code
                    </label>
                    <input data-sanitize="pincode"
                      type="text"
                      value={profileForm.pinCode}
                      onChange={(event) => setProfileForm((current) => ({ ...current, pinCode: event.target.value }))}
                      className="w-full rounded-xl border border-slate-200/90 bg-slate-50/70 px-3.5 py-2 text-xs font-semibold text-slate-900 outline-none transition focus:border-amber-400 focus:bg-white focus:ring-2 focus:ring-amber-400/20 placeholder:text-slate-400"
                      placeholder="e.g. 411001"
                    />
                  </div>

                  <div className="sm:col-span-2 lg:col-span-4">
                    <label className="block text-[11px] font-bold text-slate-700 mb-1">
                      Registered Yard / Office Physical Address
                    </label>
                    <textarea
                      value={profileForm.businessAddress}
                      onChange={(event) => setProfileForm((current) => ({ ...current, businessAddress: event.target.value }))}
                      rows={2}
                      className="w-full rounded-xl border border-slate-200/90 bg-slate-50/70 px-3.5 py-2 text-xs font-semibold text-slate-900 outline-none transition focus:border-amber-400 focus:bg-white focus:ring-2 focus:ring-amber-400/20 placeholder:text-slate-400 resize-none"
                      placeholder="Plot number, industrial area, road name, landmark..."
                    />
                  </div>
                </div>
              </div>

              {/* SUBSECTION: DIGITAL & SERVICE COVERAGE */}
              <div className="pt-2 border-t border-slate-100">
                <p className="text-[10px] font-black uppercase tracking-wider text-slate-400 mb-3 flex items-center gap-1.5">
                  <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />
                  Digital Footprint & Territory Coverage
                </p>
                <div className="grid gap-3.5 sm:grid-cols-2">
                  <div>
                    <label className="block text-[11px] font-bold text-slate-700 mb-1">
                      Website URL
                    </label>
                    <div className="relative">
                      <Globe className="absolute left-3 top-2.5 h-3.5 w-3.5 text-slate-400" />
                      <input
                        type="text"
                        value={profileForm.websiteUrl}
                        onChange={(event) => setProfileForm((current) => ({ ...current, websiteUrl: event.target.value }))}
                        className="w-full rounded-xl border border-slate-200/90 bg-slate-50/70 pl-9 pr-3.5 py-2 text-xs font-semibold text-slate-900 outline-none transition focus:border-amber-400 focus:bg-white focus:ring-2 focus:ring-amber-400/20 placeholder:text-slate-400"
                        placeholder="https://company.com"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-[11px] font-bold text-slate-700 mb-1">
                      Google Maps Location Link
                    </label>
                    <div className="relative">
                      <MapPin className="absolute left-3 top-2.5 h-3.5 w-3.5 text-slate-400" />
                      <input
                        type="text"
                        value={profileForm.googleMapsLocation}
                        onChange={(event) => setProfileForm((current) => ({ ...current, googleMapsLocation: event.target.value }))}
                        className="w-full rounded-xl border border-slate-200/90 bg-slate-50/70 pl-9 pr-3.5 py-2 text-xs font-semibold text-slate-900 outline-none transition focus:border-amber-400 focus:bg-white focus:ring-2 focus:ring-amber-400/20 placeholder:text-slate-400"
                        placeholder="https://maps.google.com/..."
                      />
                    </div>
                  </div>

                  <div className="sm:col-span-2">
                    <label className="block text-[11px] font-bold text-slate-700 mb-1">
                      Operational Service Areas / Fleet Coverage
                    </label>
                    <input
                      type="text"
                      value={profileForm.serviceAreas}
                      onChange={(event) => setProfileForm((current) => ({ ...current, serviceAreas: event.target.value }))}
                      className="w-full rounded-xl border border-slate-200/90 bg-slate-50/70 px-3.5 py-2 text-xs font-semibold text-slate-900 outline-none transition focus:border-amber-400 focus:bg-white focus:ring-2 focus:ring-amber-400/20 placeholder:text-slate-400"
                      placeholder="e.g. Pune Metropolitan, PCMC, Mumbai Highway Corridor, Satara Hub"
                    />
                  </div>
                </div>
              </div>

              {/* SAVE ACTION */}
              <div className="pt-3 border-t border-slate-100 flex items-center justify-end">
                <button
                  type="submit"
                  disabled={savingProfile || loading}
                  className="inline-flex items-center gap-2 rounded-xl bg-slate-950 px-5 py-2 text-xs font-bold text-white shadow-sm hover:bg-slate-850 active:scale-95 disabled:cursor-not-allowed disabled:opacity-60 transition-all"
                >
                  <Save className="h-3.5 w-3.5 text-amber-400" />
                  {savingProfile ? 'Saving Details...' : 'Save Profile Changes'}
                </button>
              </div>
            </form>
          </div>

          {/* SECURITY & PASSWORD FORM CARD */}
          <div className="rounded-2xl border border-slate-200/90 bg-white p-5 sm:p-6 shadow-sm">
            <div className="flex items-center gap-2 pb-4 border-b border-slate-100">
              <div className="h-7 w-7 rounded-lg bg-amber-500/10 text-amber-600 flex items-center justify-center font-bold text-xs">
                <KeyRound className="h-4 w-4" />
              </div>
              <div>
                <h2 className="text-sm font-bold text-slate-900">Security & Portal Password</h2>
                <p className="text-xs text-slate-500">Protect your partner account with a strong, rotated access secret.</p>
              </div>
            </div>

            {passwordError && (
              <div className="mt-4 flex items-center gap-2 rounded-xl border border-rose-200 bg-rose-50 px-3.5 py-2.5 text-xs font-semibold text-rose-700">
                <AlertCircle className="h-4 w-4 shrink-0 text-rose-500" />
                <span>{passwordError}</span>
              </div>
            )}
            {passwordMessage && (
              <div className="mt-4 flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-3.5 py-2.5 text-xs font-semibold text-emerald-800">
                <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" />
                <span>{passwordMessage}</span>
              </div>
            )}

            <form className="mt-4 space-y-4" onSubmit={handlePasswordSubmit}>
              <div className="grid gap-3.5 sm:grid-cols-2">
                <div>
                  <label className="block text-[11px] font-bold text-slate-700 mb-1">
                    New Security Password
                  </label>
                  <input
                    type="password"
                    autoComplete="new-password"
                    value={passwordForm.newPassword}
                    onChange={(event) => setPasswordForm((current) => ({ ...current, newPassword: event.target.value }))}
                    className="w-full rounded-xl border border-slate-200/90 bg-slate-50/70 px-3.5 py-2 text-xs font-semibold text-slate-900 outline-none transition focus:border-amber-400 focus:bg-white focus:ring-2 focus:ring-amber-400/20 placeholder:text-slate-400"
                    placeholder="Min 8 characters with numbers & symbols"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-slate-700 mb-1">
                    Confirm New Password
                  </label>
                  <input
                    type="password"
                    autoComplete="new-password"
                    value={passwordForm.confirmPassword}
                    onChange={(event) => setPasswordForm((current) => ({ ...current, confirmPassword: event.target.value }))}
                    className="w-full rounded-xl border border-slate-200/90 bg-slate-50/70 px-3.5 py-2 text-xs font-semibold text-slate-900 outline-none transition focus:border-amber-400 focus:bg-white focus:ring-2 focus:ring-amber-400/20 placeholder:text-slate-400"
                    placeholder="Re-enter password identically"
                  />
                </div>
              </div>

              <div className="flex items-center justify-between pt-2 border-t border-slate-100">
                <p className="text-[10px] text-slate-400">
                  Must be at least 8 characters. After updating, keep your credentials confidential.
                </p>
                <button
                  type="submit"
                  disabled={savingPassword}
                  className="inline-flex items-center gap-2 rounded-xl bg-amber-400 px-4 py-2 text-xs font-bold text-slate-950 shadow-sm hover:bg-amber-300 active:scale-95 disabled:cursor-not-allowed disabled:opacity-60 transition-all"
                >
                  <KeyRound className="h-3.5 w-3.5" />
                  {savingPassword ? 'Updating...' : 'Update Password'}
                </button>
              </div>
            </form>
          </div>
        </div>

        {/* RIGHT COLUMN: READINESS, COMPLIANCE & SUMMARY ASIDES */}
        <aside className="space-y-4 profile-no-print">
          {/* READINESS & SCORECARD */}
          <div className="rounded-2xl border border-slate-200/90 bg-white p-4 sm:p-5 shadow-sm">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <Sparkles className="h-4 w-4 text-amber-500" />
                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-900">Partner Readiness</h3>
              </div>
              <span className="text-xs font-black text-amber-600 bg-amber-50 px-2 py-0.5 rounded-md border border-amber-200">
                {completionPercentage}%
              </span>
            </div>

            <div className="mt-3">
              <div className="h-2 w-full rounded-full bg-slate-100 overflow-hidden">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-amber-400 to-emerald-500 transition-all duration-500"
                  style={{ width: `${completionPercentage}%` }}
                />
              </div>
            </div>

            <div className="mt-4 space-y-2">
              {onboardingChecklist.map((item) => (
                <div
                  key={item.label}
                  className="flex items-center justify-between rounded-xl bg-slate-50/80 border border-slate-100 px-3 py-2 text-xs"
                >
                  <div className="flex items-center gap-2">
                    {item.done ? (
                      <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600 shrink-0" />
                    ) : (
                      <Clock className="h-3.5 w-3.5 text-amber-500 shrink-0" />
                    )}
                    <span className="text-slate-700 font-medium text-[11px]">{item.label}</span>
                  </div>
                  <span
                    className={`inline-flex rounded-md border px-1.5 py-0.5 text-[9px] font-black uppercase tracking-wider ${
                      item.done
                        ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                        : 'border-amber-200 bg-amber-50 text-amber-700'
                    }`}
                  >
                    {item.done ? 'Ready' : 'Pending'}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* VERIFICATION & PLATFORM STATUS */}
          <div className="rounded-2xl border border-slate-200/90 bg-white p-4 sm:p-5 shadow-sm">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-900 mb-3 flex items-center gap-2">
              <Shield className="h-4 w-4 text-slate-400" />
              Credentials & Tier
            </h3>

            <div className="space-y-2">
              <div className="flex items-center justify-between rounded-xl bg-slate-50 p-2.5 border border-slate-100">
                <div className="flex items-center gap-2">
                  <BadgeCheck className="h-4 w-4 text-emerald-600" />
                  <span className="text-[11px] font-bold text-slate-600">Account Status</span>
                </div>
                <span className={`inline-flex rounded-md border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ${statusBadgeClassName(user?.accountStatus)}`}>
                  {formatLabel(user?.accountStatus)}
                </span>
              </div>

              <div className="flex items-center justify-between rounded-xl bg-slate-50 p-2.5 border border-slate-100">
                <div className="flex items-center gap-2">
                  <Shield className="h-4 w-4 text-amber-500" />
                  <span className="text-[11px] font-bold text-slate-600">KYC Status</span>
                </div>
                <span className={`inline-flex rounded-md border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ${statusBadgeClassName(user?.kycStatus)}`}>
                  {formatLabel(user?.kycStatus)}
                </span>
              </div>

              <div className="flex items-center justify-between rounded-xl bg-slate-50 p-2.5 border border-slate-100">
                <div className="flex items-center gap-2">
                  <Building2 className="h-4 w-4 text-slate-500" />
                  <span className="text-[11px] font-bold text-slate-600">Partner Tier</span>
                </div>
                <span className="text-[11px] font-black text-slate-900">
                  {formatPartnerTypeLabel(user?.partnerType, 'Standard')}
                </span>
              </div>
            </div>
          </div>

          {/* COMPLIANCE & KYC DOCUMENTS */}
          <div className="rounded-2xl border border-slate-200/90 bg-white p-4 sm:p-5 shadow-sm">
            <div className="flex items-center justify-between pb-2 border-b border-slate-100 mb-3">
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-900 flex items-center gap-2">
                <FileText className="h-4 w-4 text-slate-400" />
                Submitted Documents
              </h3>
              <span className="text-[10px] font-bold text-slate-500">
                {partnerData?.kycDocuments?.length || 0} Records
              </span>
            </div>

            <div className="space-y-2 max-h-56 overflow-y-auto pr-1">
              {partnerData?.kycDocuments?.length ? (
                partnerData.kycDocuments.map((document) => (
                  <div
                    key={`${document.documentType}-${document.fileName || document.documentNumber || document.fileUrl || 'doc'}`}
                    className="rounded-xl border border-slate-100 bg-slate-50/70 p-2.5"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-[11px] font-bold text-slate-900 truncate">
                        {formatLabel(document.documentType)}
                      </p>
                      <span className={`inline-flex shrink-0 rounded-md border px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider ${statusBadgeClassName(document.status)}`}>
                        {formatLabel(document.status)}
                      </span>
                    </div>
                    <p className="mt-1 text-[10px] font-medium text-slate-500 truncate">
                      {document.fileName || document.documentNumber || 'Document File Uploaded'}
                    </p>
                    {document.reviewComment && (
                      <p className="mt-1 text-[10px] font-semibold text-amber-700 bg-amber-50 rounded p-1">
                        Note: {document.reviewComment}
                      </p>
                    )}
                  </div>
                ))
              ) : (
                <div className="rounded-xl bg-slate-50 p-3 text-center text-xs text-slate-400">
                  No KYC documents uploaded yet.
                </div>
              )}
            </div>
          </div>

          {/* COMPLIANCE & AGREEMENTS */}
          <div className="rounded-2xl border border-slate-200/90 bg-white p-4 sm:p-5 shadow-sm">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-900 mb-3 flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 text-emerald-600" />
              Signed Declarations
            </h3>
            <div className="space-y-2">
              {partnerData?.agreements?.length ? (
                partnerData.agreements.map((agreement) => (
                  <div
                    key={agreement.agreementType}
                    className="flex items-center justify-between rounded-xl bg-slate-50/70 border border-slate-100 px-3 py-2 text-xs"
                  >
                    <span className="text-[11px] font-medium text-slate-700 truncate pr-2">
                      {formatLabel(agreement.agreementType)}
                    </span>
                    <span
                      className={`inline-flex shrink-0 items-center gap-1 rounded-md border px-1.5 py-0.5 text-[9px] font-black uppercase tracking-wider ${
                        agreement.checked
                          ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                          : 'border-slate-200 bg-white text-slate-500'
                      }`}
                    >
                      <Check className="h-2.5 w-2.5" />
                      {agreement.checked ? 'Signed' : 'Pending'}
                    </span>
                  </div>
                ))
              ) : (
                <div className="rounded-xl bg-slate-50 p-3 text-center text-xs text-slate-400">
                  No agreements recorded yet.
                </div>
              )}
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}
