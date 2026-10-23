"use client";

import React, { useCallback, useEffect, useState } from 'react';
import { useAuthStore } from '@/store/authStore';
import api from '@/lib/api';
import { getApiErrorMessage } from '@/lib/apiError.mjs';
import { getProfileSessionToken } from '@/lib/profileSession.mjs';
import { User, Phone, Mail, MessageCircle, AlertCircle, CheckCircle2, Eye, EyeOff, KeyRound, MapPin, ShieldCheck, Save, Sparkles } from 'lucide-react';
import { useTranslation } from '@/hooks/useTranslation';
import SearchableSelect, { type Option } from '@/components/ui/SearchableSelect';
import BrandLoader from '@/components/ui/BrandLoader';

type ProfileResponse = {
  user: {
    name?: string | null;
    email?: string | null;
    hasPassword?: boolean;
    mobile?: string | null;
    whatsappNumber?: string | null;
    city?: string | null;
    state?: string | null;
  };
};

interface ProfileData {
  name: string;
  email: string;
  mobile: string;
  whatsappNumber: string;
  city: string;
  state: string;
}

interface PasswordData {
  newPassword: string;
  confirmPassword: string;
}

const emptyPasswordData: PasswordData = {
  newPassword: '',
  confirmPassword: '',
};

export default function PersonalInfoTab() {
  const { t } = useTranslation();
  const { user, setAuth, token, hasHydrated } = useAuthStore();
  
  const [formData, setFormData] = useState<ProfileData>({
    name: '',
    email: '',
    mobile: '',
    whatsappNumber: '',
    city: '',
    state: '',
  });

  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [retryCount, setRetryCount] = useState(0);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState({ type: '', text: '' });
  const [passwordData, setPasswordData] = useState<PasswordData>(emptyPasswordData);
  const [hasPassword, setHasPassword] = useState(Boolean(user?.hasPassword));
  const [passwordSaving, setPasswordSaving] = useState(false);
  const [passwordMessage, setPasswordMessage] = useState({ type: '', text: '' });
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
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
      console.error('Failed to fetch cities', error);
      setCities([]);
      setSelectedCityId('');
    }
  }, []);

  useEffect(() => {
    if (!hasHydrated) return;

    const fetchProfile = async () => {
      try {
        setLoadError(null);
        setLoading(true);
        const [profileResponse, countriesResponse] = await Promise.all([
          api.get<ProfileResponse>('/auth/profile'),
          api.get<Option[]>('/locations/countries'),
        ]);
        const userData = profileResponse.data.user;
        
        setFormData({
          name: userData.name || '',
          email: userData.email || '',
          mobile: userData.mobile || '',
          whatsappNumber: userData.whatsappNumber || '',
          city: userData.city || '',
          state: userData.state || '',
        });
        setHasPassword(Boolean(userData.hasPassword));

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
          (option) => option.name.toLowerCase() === (userData.state || '').toLowerCase(),
        );

        if (matchedState) {
          const matchedStateId = String(matchedState.id);
          setSelectedStateId(matchedStateId);
          await loadCities(matchedStateId, userData.city || '');
        } else {
          setSelectedStateId('');
          setCities([]);
          setSelectedCityId('');
        }
      } catch (error) {
        console.error('Failed to fetch profile', error);
        setLoadError('Unable to load your profile details right now.');
      } finally {
        setLoading(false);
      }
    };

    void fetchProfile();
  }, [hasHydrated, loadCities, retryCount]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const handleStateChange = async (option: Option) => {
    const nextStateId = String(option.id);
    setFormData((prev) => ({
      ...prev,
      state: option.name,
      city: '',
    }));
    setSelectedStateId(nextStateId);
    setSelectedCityId('');
    await loadCities(nextStateId);
  };

  const handleCityChange = (option: Option) => {
    setFormData((prev) => ({
      ...prev,
      city: option.name,
    }));
    setSelectedCityId(String(option.id));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setMessage({ type: '', text: '' });

    try {
      const response = await api.patch<ProfileResponse & { message?: string; token?: string }>('/auth/profile', formData);
      setMessage({ type: 'success', text: response.data.message || t('profile.profileUpdated') });
      setFormData((current) => ({
        ...current,
        name: response.data.user.name || current.name,
        email: response.data.user.email || current.email,
        mobile: response.data.user.mobile || current.mobile,
        whatsappNumber: response.data.user.whatsappNumber || current.whatsappNumber,
        city: response.data.user.city || current.city,
        state: response.data.user.state || current.state,
      }));
      
      // The backend rotates authVersion when email/mobile changes, so persist
      // the refreshed token before the next authenticated request.
      const nextToken = getProfileSessionToken(response.data.token, token);
      if (nextToken && user) {
        setAuth(nextToken, {
          ...user,
          name: response.data.user.name,
          email: response.data.user.email,
          hasPassword: response.data.user.hasPassword ?? user.hasPassword,
          mobile: response.data.user.mobile,
          whatsappNumber: response.data.user.whatsappNumber,
          city: response.data.user.city,
          state: response.data.user.state,
        });
      }
    } catch (error: unknown) {
      const errorMsg = getApiErrorMessage(error, t('profile.updateProfileFailed'));
      setMessage({ type: 'error', text: errorMsg });
    } finally {
      setSaving(false);
    }
  };

  const handlePasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setPasswordMessage({ type: '', text: '' });

    if (passwordData.newPassword.length < 8) {
      setPasswordMessage({ type: 'error', text: 'New password must be at least 8 characters long.' });
      return;
    }

    if (passwordData.newPassword !== passwordData.confirmPassword) {
      setPasswordMessage({ type: 'error', text: 'New password and confirm password must match.' });
      return;
    }

    setPasswordSaving(true);
    try {
      const response = await api.patch<ProfileResponse & { message?: string; token?: string }>(
        '/auth/profile/password',
        passwordData,
      );
      const nextToken = getProfileSessionToken(response.data.token, token);
      if (nextToken && user && response.data.user) {
        setAuth(nextToken, {
          ...user,
          ...response.data.user,
          hasPassword: true,
        });
      }
      setHasPassword(true);
      setPasswordData(emptyPasswordData);
      setPasswordMessage({ type: 'success', text: response.data.message || 'Password updated successfully.' });
    } catch (error: unknown) {
      setPasswordMessage({ type: 'error', text: getApiErrorMessage(error, 'Unable to update password.') });
    } finally {
      setPasswordSaving(false);
    }
  };

  if (!hasHydrated || loading) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center">
        <BrandLoader size="md" variant="section" bg="light" />
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="flex min-h-[40vh] flex-col items-center justify-center rounded-2xl border border-rose-200 bg-rose-50 px-6 text-center">
        <AlertCircle className="h-8 w-8 text-rose-600" />
        <h2 className="mt-3 text-lg font-bold text-rose-900">Unable to load profile</h2>
        <p className="mt-1 text-sm text-rose-700">{loadError}</p>
        <button
          type="button"
          onClick={() => setRetryCount((count) => count + 1)}
          className="mt-5 rounded-lg bg-[#FFC107] px-4 py-2 text-sm font-bold text-black transition-colors hover:bg-yellow-400"
        >
          Retry
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-8 rounded-2xl border border-gray-100 bg-white p-6 shadow-xl shadow-gray-200/50 sm:p-8">
      {/* Tab Header with Badge */}
      <div className="flex flex-col gap-4 border-b border-gray-100 pb-6 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2.5">
            <h2 className="text-xl font-bold tracking-tight text-gray-900">{t('profile.personalInformation')}</h2>
            <span className="inline-flex items-center gap-1 rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-0.5 text-xs font-semibold text-emerald-700">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500"></span>
              Verified Profile
            </span>
          </div>
          <p className="mt-1 text-sm text-gray-500">{t('profile.manageContactDetails')}</p>
        </div>
        <div className="flex items-center gap-2 rounded-xl bg-amber-50/70 border border-amber-200/60 px-3.5 py-2 text-xs font-medium text-amber-900">
          <Sparkles className="h-4 w-4 text-amber-600 flex-shrink-0" />
          <span>Prime Direct Contact Enabled</span>
        </div>
      </div>

      {message.text && (
        <div className={`flex items-center gap-3 rounded-xl p-4 border ${
          message.type === 'success' 
            ? 'bg-emerald-50/80 border-emerald-200 text-emerald-900' 
            : 'bg-rose-50/80 border-rose-200 text-rose-900'
        }`}>
          {message.type === 'success' ? (
            <CheckCircle2 className="h-5 w-5 flex-shrink-0 text-emerald-600" />
          ) : (
            <AlertCircle className="h-5 w-5 flex-shrink-0 text-rose-600" />
          )}
          <p className="text-sm font-medium">{message.text}</p>
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-8">
        {/* Section 1: Contact Credentials */}
        <div>
          <div className="mb-4 flex items-center gap-2 border-b border-gray-100 pb-3">
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-amber-100/70 text-amber-700">
              <User className="h-4 w-4" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-gray-900">Contact Details</h3>
              <p className="text-xs text-gray-400">Used for transaction updates and buyer communications</p>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
            {/* Full Name */}
            <div>
              <label className="mb-1.5 flex items-center justify-between text-xs font-semibold uppercase tracking-wider text-gray-600">
                <span>{t('profile.fullName')}</span>
                <span className="text-[10px] font-normal text-gray-400">Official Name</span>
              </label>
              <div className="relative">
                <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3.5">
                  <User className="h-4 w-4 text-gray-400" />
                </div>
                <input
                  type="text"
                  name="name"
                  value={formData.name}
                  onChange={handleChange}
                  placeholder={t('auth.fullName')}
                  className="block w-full rounded-xl border border-gray-200 bg-gray-50/30 py-2.5 pl-10 pr-3 text-sm text-gray-900 transition-all focus:border-[#FFC107] focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#FFC107]/20"
                />
              </div>
            </div>

            {/* Email Address */}
            <div>
              <label className="mb-1.5 flex items-center justify-between text-xs font-semibold uppercase tracking-wider text-gray-600">
                <span>{t('profile.emailAddress')}</span>
                <span className="text-[10px] font-normal text-emerald-600 font-semibold">Primary Login</span>
              </label>
              <div className="relative">
                <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3.5">
                  <Mail className="h-4 w-4 text-gray-400" />
                </div>
                <input
                  type="email"
                  name="email"
                  value={formData.email}
                  onChange={handleChange}
                  placeholder="you@example.com"
                  className="block w-full rounded-xl border border-gray-200 bg-gray-50/30 py-2.5 pl-10 pr-3 text-sm text-gray-900 transition-all focus:border-[#FFC107] focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#FFC107]/20"
                />
              </div>
            </div>

            {/* Mobile Number */}
            <div>
              <label className="mb-1.5 flex items-center justify-between text-xs font-semibold uppercase tracking-wider text-gray-600">
                <span>{t('profile.mobileNumber')}</span>
                <span className="text-[10px] font-normal text-gray-400">Direct Calls</span>
              </label>
              <div className="relative">
                <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3.5">
                  <Phone className="h-4 w-4 text-gray-400" />
                </div>
                <input
                  type="text"
                  name="mobile"
                  value={formData.mobile}
                  onChange={handleChange}
                  placeholder="+91 9876543210"
                  className="block w-full rounded-xl border border-gray-200 bg-gray-50/30 py-2.5 pl-10 pr-3 text-sm text-gray-900 transition-all focus:border-[#FFC107] focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#FFC107]/20"
                />
              </div>
            </div>

            {/* WhatsApp Number */}
            <div>
              <label className="mb-1.5 flex items-center justify-between text-xs font-semibold uppercase tracking-wider text-gray-600">
                <span>{t('profile.whatsappNumber')}</span>
                <span className="text-[10px] font-normal text-emerald-600">Instant Chat</span>
              </label>
              <div className="relative">
                <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3.5">
                  <MessageCircle className="h-4 w-4 text-emerald-500" />
                </div>
                <input
                  type="text"
                  name="whatsappNumber"
                  value={formData.whatsappNumber}
                  onChange={handleChange}
                  placeholder="+91 9876543210"
                  className="block w-full rounded-xl border border-gray-200 bg-gray-50/30 py-2.5 pl-10 pr-3 text-sm text-gray-900 transition-all focus:border-[#FFC107] focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#FFC107]/20"
                />
              </div>
            </div>
          </div>
        </div>

        {/* Section 2: Regional Location */}
        <div>
          <div className="mb-4 flex items-center justify-between border-b border-gray-100 pb-3">
            <div className="flex items-center gap-2">
              <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-blue-100/70 text-blue-700">
                <MapPin className="h-4 w-4" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-gray-900">Regional Base & Operating Location</h3>
                <p className="text-xs text-gray-400">Helps match nearby heavy machinery listings and field inspection agents</p>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
            {/* State */}
            <div>
              <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-gray-600">{t('profile.state')}</label>
              <SearchableSelect
                options={states}
                value={selectedStateId || formData.state}
                displayValue={formData.state}
                onChange={(option) => { void handleStateChange(option); }}
                placeholder={t('profile.state')}
                className="bg-white rounded-xl"
              />
            </div>

            {/* City */}
            <div>
              <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-gray-600">{t('profile.city')}</label>
              <SearchableSelect
                options={selectedStateId ? cities : []}
                value={selectedCityId || formData.city}
                displayValue={formData.city}
                onChange={handleCityChange}
                placeholder={selectedStateId ? t('profile.city') : t('sellModal.selectStateFirst')}
                disabled={!selectedStateId}
                className="bg-white rounded-xl"
              />
            </div>
          </div>
        </div>

        {/* Save Changes Action */}
        <div className="flex flex-col items-center justify-between gap-4 border-t border-gray-100 pt-6 sm:flex-row">
          <p className="text-xs text-gray-400">Changes will be updated instantly across your active listings & inquiries.</p>
          <button
            type="submit"
            disabled={saving}
            className="inline-flex w-full sm:w-auto items-center justify-center gap-2 rounded-xl bg-[#FFC107] px-6 py-2.5 text-sm font-bold text-black shadow-sm transition hover:bg-[#E5AD06] active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-70"
          >
            <Save className="h-4 w-4" />
            {saving ? t('profile.savingChanges') : t('profile.saveChanges')}
          </button>
        </div>
      </form>

      {/* Section 3: Account Security */}
      <section className="rounded-2xl border border-gray-100 bg-gray-50/50 p-5 sm:p-6" aria-labelledby="profile-security-heading">
        <div className="mb-6 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between border-b border-gray-200/60 pb-4">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-amber-100 text-amber-800">
              <ShieldCheck className="h-5 w-5" />
            </div>
            <div>
              <h3 id="profile-security-heading" className="text-base font-bold text-gray-900">
                {hasPassword ? 'Account Password & Security' : 'Set Account Password'}
              </h3>
              <p className="text-xs text-gray-500">
                {hasPassword
                  ? 'Update your password regularly to keep your listings and inquiries protected.'
                  : 'Set a password so you can also sign in directly with your email.'}
              </p>
            </div>
          </div>
          <span className="inline-flex items-center gap-1.5 self-start sm:self-auto rounded-full bg-white px-3 py-1 text-xs font-semibold text-gray-700 border border-gray-200 shadow-xs">
            <KeyRound className="h-3.5 w-3.5 text-amber-600" />
            {hasPassword ? 'Password Active' : 'No Password'}
          </span>
        </div>

        {passwordMessage.text && (
          <div className={`mb-6 flex items-center gap-3 rounded-xl p-4 border ${
            passwordMessage.type === 'success' 
              ? 'bg-emerald-50/80 border-emerald-200 text-emerald-900' 
              : 'bg-rose-50/80 border-rose-200 text-rose-900'
          }`}>
            {passwordMessage.type === 'success' ? (
              <CheckCircle2 className="h-5 w-5 flex-shrink-0 text-emerald-600" />
            ) : (
              <AlertCircle className="h-5 w-5 flex-shrink-0 text-rose-600" />
            )}
            <p className="text-sm font-medium">{passwordMessage.text}</p>
          </div>
        )}

        <form onSubmit={handlePasswordSubmit} className="space-y-5">
          <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
            <label className="block">
              <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-gray-600">New Password</span>
              <div className="relative">
                <input
                  type={showNewPassword ? 'text' : 'password'}
                  autoComplete="new-password"
                  value={passwordData.newPassword}
                  onChange={(event) => setPasswordData((current) => ({ ...current, newPassword: event.target.value }))}
                  className="block w-full rounded-xl border border-gray-200 bg-white py-2.5 pl-3.5 pr-10 text-sm text-gray-900 transition-all focus:border-[#FFC107] focus:outline-none focus:ring-2 focus:ring-[#FFC107]/20"
                  placeholder="Minimum 8 characters"
                />
                <button
                  type="button"
                  aria-label={showNewPassword ? 'Hide new password' : 'Show new password'}
                  onClick={() => setShowNewPassword((visible) => !visible)}
                  className="absolute inset-y-0 right-0 flex items-center px-3.5 text-gray-400 hover:text-gray-700"
                >
                  {showNewPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </label>

            <label className="block">
              <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-gray-600">Confirm New Password</span>
              <div className="relative">
                <input
                  type={showConfirmPassword ? 'text' : 'password'}
                  autoComplete="new-password"
                  value={passwordData.confirmPassword}
                  onChange={(event) => setPasswordData((current) => ({ ...current, confirmPassword: event.target.value }))}
                  className="block w-full rounded-xl border border-gray-200 bg-white py-2.5 pl-3.5 pr-10 text-sm text-gray-900 transition-all focus:border-[#FFC107] focus:outline-none focus:ring-2 focus:ring-[#FFC107]/20"
                  placeholder="Re-enter new password"
                />
                <button
                  type="button"
                  aria-label={showConfirmPassword ? 'Hide confirmation password' : 'Show confirmation password'}
                  onClick={() => setShowConfirmPassword((visible) => !visible)}
                  className="absolute inset-y-0 right-0 flex items-center px-3.5 text-gray-400 hover:text-gray-700"
                >
                  {showConfirmPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </label>
          </div>

          <div className="flex flex-col items-center justify-between gap-4 pt-2 sm:flex-row">
            <span className="text-xs text-gray-400">Encrypted with industry standard 256-bit hashing.</span>
            <button
              type="submit"
              disabled={passwordSaving}
              className="inline-flex w-full sm:w-auto items-center justify-center gap-2 rounded-xl bg-gray-900 px-6 py-2.5 text-sm font-bold text-white transition hover:bg-black active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-70"
            >
              <KeyRound className="h-4 w-4 text-[#FFC107]" />
              {passwordSaving ? 'Updating...' : hasPassword ? 'Update Password' : 'Set Password'}
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}

