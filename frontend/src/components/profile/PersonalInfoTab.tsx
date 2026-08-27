"use client";

import React, { useCallback, useEffect, useState } from 'react';
import { useAuthStore } from '@/store/authStore';
import api from '@/lib/api';
import { User, Phone, Mail, MessageCircle, AlertCircle, CheckCircle2 } from 'lucide-react';
import { useTranslation } from '@/hooks/useTranslation';
import SearchableSelect, { type Option } from '@/components/ui/SearchableSelect';

type ProfileResponse = {
  user: {
    name?: string | null;
    email?: string | null;
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
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState({ type: '', text: '' });
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
      } finally {
        setLoading(false);
      }
    };

    void fetchProfile();
  }, [hasHydrated, loadCities]);

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
      const response = await api.patch<ProfileResponse & { message?: string }>('/auth/profile', formData);
      setMessage({ type: 'success', text: response.data.message || t('profile.profileUpdated') });
      
      // Update local storage user if name/email changed
      if (token && user) {
        setAuth(token, {
          ...user,
          name: response.data.user.name,
          email: response.data.user.email,
        });
      }
    } catch (error: unknown) {
      const errorMsg = error instanceof Error ? error.message : t('profile.updateProfileFailed');
      setMessage({ type: 'error', text: errorMsg });
    } finally {
      setSaving(false);
    }
  };

  if (!hasHydrated || loading) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-[#FFC107] border-t-transparent"></div>
      </div>
    );
  }

  return (
    <div className="rounded-2xl bg-white p-6 shadow-xl shadow-gray-200/50 sm:p-8">
      <div className="mb-8 border-b border-gray-100 pb-6">
        <h2 className="text-xl font-bold text-gray-900">{t('profile.personalInformation')}</h2>
        <p className="mt-1 text-sm text-gray-500">{t('profile.manageContactDetails')}</p>
      </div>

      {message.text && (
        <div className={`mb-6 flex items-center gap-3 rounded-lg p-4 ${
          message.type === 'success' ? 'bg-green-50 text-green-800' : 'bg-red-50 text-red-800'
        }`}>
          {message.type === 'success' ? (
            <CheckCircle2 className="h-5 w-5 flex-shrink-0 text-green-500" />
          ) : (
            <AlertCircle className="h-5 w-5 flex-shrink-0 text-red-500" />
          )}
          <p className="text-sm font-medium">{message.text}</p>
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-6">
        <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
          {/* Full Name */}
          <div>
            <label className="mb-2 block text-sm font-semibold text-gray-700">{t('profile.fullName')}</label>
            <div className="relative">
              <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3">
                <User className="h-4 w-4 text-gray-400" />
              </div>
              <input
                type="text"
                name="name"
                value={formData.name}
                onChange={handleChange}
                placeholder={t('auth.fullName')}
                className="block w-full rounded-lg border border-gray-200 py-2.5 pl-10 pr-3 text-sm text-gray-900 focus:border-[#FFC107] focus:outline-none focus:ring-1 focus:ring-[#FFC107]"
              />
            </div>
          </div>

          {/* Email Address */}
          <div>
            <label className="mb-2 block text-sm font-semibold text-gray-700">{t('profile.emailAddress')}</label>
            <div className="relative">
              <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3">
                <Mail className="h-4 w-4 text-gray-400" />
              </div>
              <input
                type="email"
                name="email"
                value={formData.email}
                onChange={handleChange}
                placeholder="you@example.com"
                className="block w-full rounded-lg border border-gray-200 py-2.5 pl-10 pr-3 text-sm text-gray-900 focus:border-[#FFC107] focus:outline-none focus:ring-1 focus:ring-[#FFC107]"
              />
            </div>
          </div>

          {/* Mobile Number */}
          <div>
            <label className="mb-2 block text-sm font-semibold text-gray-700">{t('profile.mobileNumber')}</label>
            <div className="relative">
              <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3">
                <Phone className="h-4 w-4 text-gray-400" />
              </div>
              <input
                type="text"
                name="mobile"
                value={formData.mobile}
                onChange={handleChange}
                placeholder="+91 9876543210"
                className="block w-full rounded-lg border border-gray-200 py-2.5 pl-10 pr-3 text-sm text-gray-900 focus:border-[#FFC107] focus:outline-none focus:ring-1 focus:ring-[#FFC107]"
              />
            </div>
          </div>

          {/* WhatsApp Number */}
          <div>
            <label className="mb-2 block text-sm font-semibold text-gray-700">{t('profile.whatsappNumber')}</label>
            <div className="relative">
              <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3">
                <MessageCircle className="h-4 w-4 text-gray-400" />
              </div>
              <input
                type="text"
                name="whatsappNumber"
                value={formData.whatsappNumber}
                onChange={handleChange}
                placeholder="+91 9876543210"
                className="block w-full rounded-lg border border-gray-200 py-2.5 pl-10 pr-3 text-sm text-gray-900 focus:border-[#FFC107] focus:outline-none focus:ring-1 focus:ring-[#FFC107]"
              />
            </div>
          </div>

          {/* State */}
          <div>
            <label className="mb-2 block text-sm font-semibold text-gray-700">{t('profile.state')}</label>
            <SearchableSelect
              options={states}
              value={selectedStateId || formData.state}
              displayValue={formData.state}
              onChange={(option) => { void handleStateChange(option); }}
              placeholder={t('profile.state')}
              className="bg-white"
            />
          </div>

          {/* City */}
          <div>
            <label className="mb-2 block text-sm font-semibold text-gray-700">{t('profile.city')}</label>
            <SearchableSelect
              options={selectedStateId ? cities : []}
              value={selectedCityId || formData.city}
              displayValue={formData.city}
              onChange={handleCityChange}
              placeholder={selectedStateId ? t('profile.city') : t('sellModal.selectStateFirst')}
              disabled={!selectedStateId}
              className="bg-white"
            />
          </div>
        </div>

        <div className="mt-8 flex justify-end border-t border-gray-100 pt-6">
          <button
            type="submit"
            disabled={saving}
            className="rounded-lg bg-[#FFC107] px-6 py-2.5 text-sm font-bold text-black transition hover:bg-[#E5AD06] disabled:cursor-not-allowed disabled:opacity-70"
          >
            {saving ? t('profile.savingChanges') : t('profile.saveChanges')}
          </button>
        </div>
      </form>
    </div>
  );
}

