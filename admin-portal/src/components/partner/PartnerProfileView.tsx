'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import type { AxiosError } from 'axios';
import {
  BadgeCheck,
  Building2,
  CheckCircle2,
  KeyRound,
  Mail,
  MapPin,
  Phone,
  Save,
  Shield,
  Store,
} from 'lucide-react';
import api from '@/lib/api';
import { formatPartnerTypeLabel } from '@/lib/partnerType';
import { useAuthStore } from '@/store/authStore';
import SearchableSelect, { type Option } from '@/components/ui/SearchableSelect';

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
      return 'border-emerald-200 bg-emerald-50 text-emerald-700';
    case 'PENDING':
    case 'REVIEW_PENDING':
    case 'VERIFICATION_PENDING':
    case 'SUBMITTED':
      return 'border-amber-200 bg-amber-50 text-amber-700';
    case 'REJECTED':
    case 'BLOCKED':
    case 'SUSPENDED':
      return 'border-red-200 bg-red-50 text-red-700';
    default:
      return 'border-slate-200 bg-slate-50 text-slate-700';
  }
};

export default function PartnerProfileView() {
  const { user, updateUser } = useAuthStore();
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
      { label: 'Account details ready', done: partnerData.progress.profileComplete },
      { label: 'KYC documents ready', done: partnerData.progress.documentsComplete },
      { label: 'Agreements accepted', done: partnerData.progress.agreementsComplete },
    ];
  }, [partnerData]);

  if (loading) {
    return (
      <div className="rounded-[24px] border border-slate-200 bg-white p-6 text-sm text-slate-500 shadow-[0_24px_60px_-38px_rgba(15,23,42,0.25)]">
        Loading partner profile...
      </div>
    );
  }

  const handleProfileSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSavingProfile(true);
    setProfileError(null);
    setProfileMessage(null);

    try {
      const response = await api.patch('/auth/profile', profileForm);
      updateUser(response.data.user);

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

      setProfileMessage(response.data.message || 'Profile updated successfully.');
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
      setPasswordForm(emptyPasswordForm);
      setPasswordMessage(response.data.message || 'Password updated successfully.');
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
    <div className="w-full mx-auto max-w-6xl space-y-6">
      <section className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm">
        <div className="relative overflow-hidden bg-gray-900 px-6 py-8 sm:px-8">
          <div className="absolute inset-0 bg-gradient-to-r from-gray-900 via-gray-800 to-[#FFC107]/20" />
          <div className="relative flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
            <div className="flex items-center gap-5">
              <div className="flex h-20 w-20 items-center justify-center rounded-2xl border border-white/20 bg-white/10 shadow-inner backdrop-blur-sm">
                {user?.partnerType === 'SHOWROOM' ? <Store className="h-10 w-10 text-[#FFC107]" /> : <Building2 className="h-10 w-10 text-[#FFC107]" />}
              </div>
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-gray-400">Partner Identity</p>
                <h2 className="mt-1 text-3xl font-bold tracking-tight text-white">{profileForm.businessName || user?.name || 'Partner Account'}</h2>
                <p className="mt-1 text-sm font-medium text-gray-300">{profileForm.ownerName || user?.ownerName || '-'}</p>
              </div>
            </div>

            <div className="flex flex-wrap gap-3">
              <span className="inline-flex items-center gap-2 rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-sm font-medium text-white backdrop-blur">
                <Shield className="h-4 w-4 text-[#FFC107]" />
                {formatPartnerTypeLabel(user?.partnerType, '-')}
              </span>
              <span className={`inline-flex items-center gap-2 rounded-lg border px-3 py-1.5 text-sm font-medium backdrop-blur ${statusBadgeClassName(user?.accountStatus)}`}>
                <BadgeCheck className="h-4 w-4" />
                {formatLabel(user?.accountStatus)}
              </span>
            </div>
          </div>
        </div>
      </section>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.45fr)_360px]">
        <section className="space-y-6">
          <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
            <div className="mb-6">
              <p className="text-xs font-semibold uppercase tracking-wider text-gray-500">Profile</p>
              <h3 className="mt-1 text-xl font-bold text-gray-900">Manage partner details</h3>
              <p className="mt-1 text-sm text-gray-500">Essential account and business information for this partner only.</p>
            </div>

            {profileError ? (
              <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{profileError}</div>
            ) : null}
            {profileMessage ? (
              <div className="mb-4 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">{profileMessage}</div>
            ) : null}

            <form className="grid gap-6 md:grid-cols-2" onSubmit={handleProfileSubmit}>
              <label className="block">
                <span className="mb-1.5 block text-sm font-semibold text-gray-700">Owner name</span>
                <input
                  type="text"
                  value={profileForm.ownerName}
                  onChange={(event) => setProfileForm((current) => ({ ...current, ownerName: event.target.value }))}
                  className="w-full rounded-lg border border-gray-300 bg-white px-4 py-2.5 text-sm text-gray-900 outline-none transition focus:border-[#FFC107] focus:ring-1 focus:ring-[#FFC107]"
                  placeholder="Enter owner name"
                />
              </label>

              <label className="block">
                <span className="mb-1.5 block text-sm font-semibold text-gray-700">Business name</span>
                <input
                  type="text"
                  value={profileForm.businessName}
                  onChange={(event) => setProfileForm((current) => ({ ...current, businessName: event.target.value }))}
                  className="w-full rounded-lg border border-gray-300 bg-white px-4 py-2.5 text-sm text-gray-900 outline-none transition focus:border-[#FFC107] focus:ring-1 focus:ring-[#FFC107]"
                  placeholder="Enter business name"
                />
              </label>

              <label className="block">
                <span className="mb-1.5 block text-sm font-semibold text-gray-700">Email address</span>
                <input
                  type="email"
                  value={profileForm.email}
                  onChange={(event) => setProfileForm((current) => ({ ...current, email: event.target.value }))}
                  className="w-full rounded-lg border border-gray-300 bg-white px-4 py-2.5 text-sm text-gray-900 outline-none transition focus:border-[#FFC107] focus:ring-1 focus:ring-[#FFC107]"
                  placeholder="Enter email address"
                />
              </label>

              <label className="block">
                <span className="mb-1.5 block text-sm font-semibold text-gray-700">Primary mobile</span>
                <input
                  type="text"
                  value={profileForm.mobile}
                  onChange={(event) => setProfileForm((current) => ({ ...current, mobile: event.target.value }))}
                  className="w-full rounded-lg border border-gray-300 bg-white px-4 py-2.5 text-sm text-gray-900 outline-none transition focus:border-[#FFC107] focus:ring-1 focus:ring-[#FFC107]"
                  placeholder="Enter primary mobile"
                />
              </label>

              <label className="block">
                <span className="mb-1.5 block text-sm font-semibold text-gray-700">WhatsApp number</span>
                <input
                  type="text"
                  value={profileForm.whatsappNumber}
                  onChange={(event) => setProfileForm((current) => ({ ...current, whatsappNumber: event.target.value }))}
                  className="w-full rounded-lg border border-gray-300 bg-white px-4 py-2.5 text-sm text-gray-900 outline-none transition focus:border-[#FFC107] focus:ring-1 focus:ring-[#FFC107]"
                  placeholder="Enter WhatsApp number"
                />
              </label>

              <div className="block">
                <span className="mb-1.5 block text-sm font-semibold text-gray-700">Partner type</span>
                <div className="w-full rounded-lg border border-gray-200 bg-gray-50 px-4 py-2.5 text-sm text-gray-900">
                  {formatPartnerTypeLabel(user?.partnerType, '-')}
                </div>
              </div>

              <label className="block">
                <span className="mb-1.5 block text-sm font-semibold text-gray-700">State</span>
                <SearchableSelect
                  options={states}
                  value={selectedStateId || profileForm.state}
                  displayValue={profileForm.state}
                  onChange={(option) => { void handleStateChange(option); }}
                  placeholder="Select state"
                  className="bg-white"
                />
              </label>

              <label className="block">
                <span className="mb-1.5 block text-sm font-semibold text-gray-700">District</span>
                <input
                  type="text"
                  value={profileForm.district}
                  onChange={(event) => setProfileForm((current) => ({ ...current, district: event.target.value }))}
                  className="w-full rounded-lg border border-gray-300 bg-white px-4 py-2.5 text-sm text-gray-900 outline-none transition focus:border-[#FFC107] focus:ring-1 focus:ring-[#FFC107]"
                  placeholder="Enter district"
                />
              </label>

              <label className="block">
                <span className="mb-1.5 block text-sm font-semibold text-gray-700">City</span>
                <SearchableSelect
                  options={selectedStateId ? cities : []}
                  value={selectedCityId || profileForm.city}
                  displayValue={profileForm.city}
                  onChange={handleCityChange}
                  placeholder={selectedStateId ? 'Select city' : 'Select state first'}
                  disabled={!selectedStateId}
                  className="bg-white"
                />
              </label>

              <label className="block">
                <span className="mb-1.5 block text-sm font-semibold text-gray-700">PIN code</span>
                <input
                  type="text"
                  value={profileForm.pinCode}
                  onChange={(event) => setProfileForm((current) => ({ ...current, pinCode: event.target.value }))}
                  className="w-full rounded-lg border border-gray-300 bg-white px-4 py-2.5 text-sm text-gray-900 outline-none transition focus:border-[#FFC107] focus:ring-1 focus:ring-[#FFC107]"
                  placeholder="Enter PIN code"
                />
              </label>

              <label className="block md:col-span-2">
                <span className="mb-1.5 block text-sm font-semibold text-gray-700">Business address</span>
                <textarea
                  value={profileForm.businessAddress}
                  onChange={(event) => setProfileForm((current) => ({ ...current, businessAddress: event.target.value }))}
                  rows={3}
                  className="w-full rounded-lg border border-gray-300 bg-white px-4 py-2.5 text-sm text-gray-900 outline-none transition focus:border-[#FFC107] focus:ring-1 focus:ring-[#FFC107]"
                  placeholder="Enter business address"
                />
              </label>

              <label className="block">
                <span className="mb-1.5 block text-sm font-semibold text-gray-700">Website</span>
                <input
                  type="text"
                  value={profileForm.websiteUrl}
                  onChange={(event) => setProfileForm((current) => ({ ...current, websiteUrl: event.target.value }))}
                  className="w-full rounded-lg border border-gray-300 bg-white px-4 py-2.5 text-sm text-gray-900 outline-none transition focus:border-[#FFC107] focus:ring-1 focus:ring-[#FFC107]"
                  placeholder="https://example.com"
                />
              </label>

              <label className="block">
                <span className="mb-1.5 block text-sm font-semibold text-gray-700">Google Maps link</span>
                <input
                  type="text"
                  value={profileForm.googleMapsLocation}
                  onChange={(event) => setProfileForm((current) => ({ ...current, googleMapsLocation: event.target.value }))}
                  className="w-full rounded-lg border border-gray-300 bg-white px-4 py-2.5 text-sm text-gray-900 outline-none transition focus:border-[#FFC107] focus:ring-1 focus:ring-[#FFC107]"
                  placeholder="Paste map link"
                />
              </label>

              <label className="block md:col-span-2">
                <span className="mb-1.5 block text-sm font-semibold text-gray-700">Service areas</span>
                <input
                  type="text"
                  value={profileForm.serviceAreas}
                  onChange={(event) => setProfileForm((current) => ({ ...current, serviceAreas: event.target.value }))}
                  className="w-full rounded-lg border border-gray-300 bg-white px-4 py-2.5 text-sm text-gray-900 outline-none transition focus:border-[#FFC107] focus:ring-1 focus:ring-[#FFC107]"
                  placeholder="Cities or coverage areas"
                />
              </label>

              <div className="md:col-span-2 flex justify-end">
                <button
                  type="submit"
                  disabled={savingProfile || loading}
                  className="inline-flex items-center gap-2 rounded-lg bg-gray-900 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-gray-800 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  <Save className="h-4 w-4" />
                  {savingProfile ? 'Saving...' : 'Save changes'}
                </button>
              </div>
            </form>
          </div>

          <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
            <div className="mb-6">
              <p className="text-xs font-semibold uppercase tracking-wider text-gray-500">Security</p>
              <h3 className="mt-1 text-xl font-bold text-gray-900">Change password</h3>
              <p className="mt-1 text-sm text-gray-500">Update partner login access with a new secure password.</p>
            </div>

            {passwordError ? (
              <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{passwordError}</div>
            ) : null}
            {passwordMessage ? (
              <div className="mb-4 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">{passwordMessage}</div>
            ) : null}

            <form className="grid gap-6 md:grid-cols-2" onSubmit={handlePasswordSubmit}>
              <label className="block">
                <span className="mb-1.5 block text-sm font-semibold text-gray-700">New password</span>
                <input
                  type="password"
                  value={passwordForm.newPassword}
                  onChange={(event) => setPasswordForm((current) => ({ ...current, newPassword: event.target.value }))}
                  className="w-full rounded-lg border border-gray-300 bg-white px-4 py-2.5 text-sm text-gray-900 outline-none transition focus:border-[#FFC107] focus:ring-1 focus:ring-[#FFC107]"
                  placeholder="Minimum 8 characters"
                />
              </label>

              <label className="block">
                <span className="mb-1.5 block text-sm font-semibold text-gray-700">Confirm new password</span>
                <input
                  type="password"
                  value={passwordForm.confirmPassword}
                  onChange={(event) => setPasswordForm((current) => ({ ...current, confirmPassword: event.target.value }))}
                  className="w-full rounded-lg border border-gray-300 bg-white px-4 py-2.5 text-sm text-gray-900 outline-none transition focus:border-[#FFC107] focus:ring-1 focus:ring-[#FFC107]"
                  placeholder="Re-enter new password"
                />
              </label>

              <div className="sm:col-span-2 flex justify-end">
                <button
                  type="submit"
                  disabled={savingPassword}
                  className="inline-flex items-center gap-2 rounded-lg bg-[#FFC107] px-5 py-2.5 text-sm font-semibold text-black transition hover:bg-[#E5AD06] disabled:cursor-not-allowed disabled:opacity-60"
                >
                  <KeyRound className="h-4 w-4" />
                  {savingPassword ? 'Updating...' : 'Update password'}
                </button>
              </div>
            </form>
          </div>
        </section>

        <aside className="space-y-6">
          <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
            <p className="text-xs font-semibold uppercase tracking-wider text-gray-500">Account Overview</p>
            <h3 className="mt-1 text-xl font-bold text-gray-900">Verification snapshot</h3>

            <div className="mt-5 space-y-3">
              <div className="flex items-center gap-4 rounded-xl bg-gray-50 px-4 py-3">
                <Shield className="h-5 w-5 text-gray-400" />
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-500">Account status</p>
                  <div className="mt-0.5">
                    <span className={`inline-flex rounded-md border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${statusBadgeClassName(user?.accountStatus)}`}>
                      {formatLabel(user?.accountStatus)}
                    </span>
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-4 rounded-xl bg-gray-50 px-4 py-3">
                <BadgeCheck className="h-5 w-5 text-gray-400" />
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-500">KYC status</p>
                  <div className="mt-0.5">
                    <span className={`inline-flex rounded-md border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${statusBadgeClassName(user?.kycStatus)}`}>
                      {formatLabel(user?.kycStatus)}
                    </span>
                  </div>
                </div>
              </div>

            </div>
          </div>

          <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
            <p className="text-xs font-semibold uppercase tracking-wider text-gray-500">Readiness</p>
            <h3 className="mt-1 text-xl font-bold text-gray-900">Current checklist</h3>

            <div className="mt-4 space-y-2">
              {onboardingChecklist.map((item) => (
                <div key={item.label} className="flex items-center justify-between rounded-lg bg-gray-50 px-4 py-2.5">
                  <span className="text-sm font-medium text-gray-700">{item.label}</span>
                  <span className={`inline-flex rounded-md border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${item.done ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : 'border-amber-200 bg-amber-50 text-amber-700'}`}>
                    {item.done ? 'Ready' : 'Pending'}
                  </span>
                </div>
              ))}
            </div>
          </div>


          <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
            <p className="text-xs font-semibold uppercase tracking-wider text-gray-500">Business Snapshot</p>
            <div className="mt-4 space-y-3">
              <div className="flex items-center gap-3 text-sm text-gray-700">
                <Mail className="h-4 w-4 text-gray-400" />
                <span className="font-medium">{profileForm.email || '-'}</span>
              </div>
              <div className="flex items-center gap-3 text-sm text-gray-700">
                <Phone className="h-4 w-4 text-gray-400" />
                <span className="font-medium">{profileForm.mobile || profileForm.whatsappNumber || '-'}</span>
              </div>
              <div className="flex items-start gap-3 text-sm text-gray-700">
                <MapPin className="mt-0.5 h-4 w-4 text-gray-400" />
                <span className="font-medium">{[profileForm.city, profileForm.district, profileForm.state].filter(Boolean).join(', ') || '-'}</span>
              </div>
            </div>
          </div>

          <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
            <p className="text-xs font-semibold uppercase tracking-wider text-gray-500">KYC Documents</p>
            <h3 className="mt-1 text-xl font-bold text-gray-900">Submitted records</h3>
            <div className="mt-4 space-y-2">
              {partnerData?.kycDocuments?.length ? (
                partnerData.kycDocuments.map((document) => (
                  <div key={`${document.documentType}-${document.fileName || document.documentNumber || document.fileUrl || 'doc'}`} className="rounded-lg border border-gray-200 bg-gray-50 px-4 py-3">
                    <div className="flex items-center justify-between gap-3">
                      <p className="text-sm font-semibold text-gray-900">{formatLabel(document.documentType)}</p>
                      <span className={`inline-flex rounded-md border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${statusBadgeClassName(document.status)}`}>
                        {formatLabel(document.status)}
                      </span>
                    </div>
                    <p className="mt-1 text-xs text-gray-500">{document.fileName || document.documentNumber || 'Document uploaded'}</p>
                    {document.reviewComment ? <p className="mt-2 text-xs text-amber-700">Note: {document.reviewComment}</p> : null}
                  </div>
                ))
              ) : (
                <div className="rounded-lg bg-gray-50 px-4 py-4 text-sm text-gray-500">No KYC documents available yet.</div>
              )}
            </div>
          </div>


          <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
            <p className="text-xs font-semibold uppercase tracking-wider text-gray-500">Agreements</p>
            <h3 className="mt-1 text-xl font-bold text-gray-900">Accepted agreements</h3>
            <div className="mt-4 space-y-2">
              {partnerData?.agreements?.length ? (
                partnerData.agreements.map((agreement) => (
                  <div key={agreement.agreementType} className="flex items-center justify-between rounded-lg bg-gray-50 px-4 py-2.5">
                    <span className="text-sm font-medium text-gray-700">{formatLabel(agreement.agreementType)}</span>
                    <span className={`inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${agreement.checked ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : 'border-gray-200 bg-white text-gray-600'}`}>
                      <CheckCircle2 className="h-3 w-3" />
                      {agreement.checked ? 'Accepted' : 'Pending'}
                    </span>
                  </div>
                ))
              ) : (
                <div className="rounded-lg bg-gray-50 px-4 py-4 text-sm text-gray-500">No agreements found yet.</div>
              )}
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}
