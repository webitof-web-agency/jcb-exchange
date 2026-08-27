'use client';

import { useEffect, useState } from 'react';
import {
  BadgeCheck,
  CalendarDays,
  KeyRound,
  Mail,
  Phone,
  Save,
  Shield,
  UserCircle2,
} from 'lucide-react';
import api from '@/lib/api';
import { useAuthStore } from '@/store/authStore';
import type { AxiosError } from 'axios';

type ProfileFormState = {
  name: string;
  email: string;
  mobile: string;
  whatsappNumber: string;
};

type PasswordFormState = {
  newPassword: string;
  confirmPassword: string;
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

const formatDate = (value?: string) => {
  if (!value) {
    return '-';
  }

  const parsedDate = new Date(value);
  if (Number.isNaN(parsedDate.getTime())) {
    return '-';
  }

  return parsedDate.toLocaleDateString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
};

const badgeClassName = (status?: string) => {
  switch (status) {
    case 'ACTIVE':
      return 'border-emerald-200 bg-emerald-50 text-emerald-700';
    case 'INACTIVE':
      return 'border-amber-200 bg-amber-50 text-amber-700';
    case 'BLOCKED':
    case 'SUSPENDED':
      return 'border-red-200 bg-red-50 text-red-700';
    default:
      return 'border-slate-200 bg-slate-50 text-slate-700';
  }
};

const getApiErrorMessage = (error: unknown, fallbackMessage: string) => {
  const axiosError = error as AxiosError<{ error?: string }>;
  return axiosError.response?.data?.error || fallbackMessage;
};

export default function AdminProfileView() {
  const { user, updateUser } = useAuthStore();
  const [profileForm, setProfileForm] = useState<ProfileFormState>({
    name: user?.name || '',
    email: user?.email || '',
    mobile: user?.mobile || '',
    whatsappNumber: user?.whatsappNumber || '',
  });
  const [passwordForm, setPasswordForm] = useState<PasswordFormState>(emptyPasswordForm);
  const [loading, setLoading] = useState(true);
  const [savingProfile, setSavingProfile] = useState(false);
  const [savingPassword, setSavingPassword] = useState(false);
  const [profileMessage, setProfileMessage] = useState<string | null>(null);
  const [passwordMessage, setPasswordMessage] = useState<string | null>(null);
  const [profileError, setProfileError] = useState<string | null>(null);
  const [passwordError, setPasswordError] = useState<string | null>(null);

  useEffect(() => {
    const loadProfile = async () => {
      setLoading(true);
      setProfileError(null);

      try {
        const response = await api.get('/auth/profile');
        updateUser(response.data.user);
        setProfileForm({
          name: response.data.user?.name || '',
          email: response.data.user?.email || '',
          mobile: response.data.user?.mobile || '',
          whatsappNumber: response.data.user?.whatsappNumber || '',
        });
      } catch (error: unknown) {
        setProfileError(getApiErrorMessage(error, 'Unable to load profile details.'));
      } finally {
        setLoading(false);
      }
    };

    void loadProfile();
  }, [updateUser]);

  const handleProfileSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSavingProfile(true);
    setProfileError(null);
    setProfileMessage(null);

    try {
      const response = await api.patch('/auth/profile', profileForm);
      updateUser(response.data.user);
      setProfileForm({
        name: response.data.user?.name || '',
        email: response.data.user?.email || '',
        mobile: response.data.user?.mobile || '',
        whatsappNumber: response.data.user?.whatsappNumber || '',
      });
      setProfileMessage(response.data.message || 'Profile updated successfully.');
    } catch (error: unknown) {
      setProfileError(getApiErrorMessage(error, 'Unable to update profile.'));
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

  return (
    <div className="w-full mx-auto max-w-6xl space-y-6">
      <section className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm">
        <div className="relative overflow-hidden bg-gray-900 px-6 py-8 sm:px-8">
          <div className="absolute inset-0 bg-gradient-to-r from-gray-900 via-gray-800 to-[#FFC107]/20" />
          <div className="relative flex flex-col gap-6 sm:flex-row sm:items-end sm:justify-between">
            <div className="flex items-center gap-5">
              <div className="flex h-20 w-20 items-center justify-center rounded-2xl border border-white/20 bg-white/10 shadow-inner backdrop-blur-sm">
                <UserCircle2 className="h-10 w-10 text-[#FFC107]" />
              </div>
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-gray-400">Admin Identity</p>
                <h2 className="mt-1 text-3xl font-bold tracking-tight text-white">{user?.name || 'Portal User'}</h2>
                <p className="mt-1 text-sm font-medium text-gray-300">{user?.email || 'No email available'}</p>
              </div>
            </div>

            <div className="flex flex-wrap gap-3">
              <span className="inline-flex items-center gap-2 rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-sm font-medium text-white backdrop-blur">
                <Shield className="h-4 w-4 text-[#FFC107]" />
                {formatLabel(user?.role)}
              </span>
              <span className="inline-flex items-center gap-2 rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-sm font-medium text-white backdrop-blur">
                <BadgeCheck className="h-4 w-4 text-emerald-400" />
                {user?.isRootAdmin ? 'Root access' : 'Managed access'}
              </span>
            </div>
          </div>
        </div>
      </section>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.45fr)_360px]">
        <section className="space-y-6">
          <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
            <div className="mb-6 flex items-center justify-between gap-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-gray-500">Personal Information</p>
                <h3 className="mt-1 text-xl font-bold text-gray-900">Update admin identity</h3>
                <p className="mt-1 text-sm text-gray-500">Keep only the essential contact fields editable for secure day-to-day operations.</p>
              </div>
            </div>

            {profileError ? (
              <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{profileError}</div>
            ) : null}
            {profileMessage ? (
              <div className="mb-4 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">{profileMessage}</div>
            ) : null}

            <form className="grid gap-6 md:grid-cols-2" onSubmit={handleProfileSubmit}>
              <label className="block">
                <span className="mb-1.5 block text-sm font-semibold text-gray-700">Full name</span>
                <input
                  type="text"
                  value={profileForm.name}
                  onChange={(event) => setProfileForm((current) => ({ ...current, name: event.target.value }))}
                  className="w-full rounded-lg border border-gray-300 bg-white px-4 py-2.5 text-sm text-gray-900 outline-none transition focus:border-[#FFC107] focus:ring-1 focus:ring-[#FFC107]"
                  placeholder="Enter full name"
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
                <span className="mb-1.5 block text-sm font-semibold text-gray-700">Mobile number</span>
                <input
                  type="text"
                  value={profileForm.mobile}
                  onChange={(event) => setProfileForm((current) => ({ ...current, mobile: event.target.value }))}
                  className="w-full rounded-lg border border-gray-300 bg-white px-4 py-2.5 text-sm text-gray-900 outline-none transition focus:border-[#FFC107] focus:ring-1 focus:ring-[#FFC107]"
                  placeholder="Enter mobile number"
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
              <p className="mt-1 text-sm text-gray-500">Set a new secure password for this super admin account.</p>
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

              <div className="md:col-span-2 flex justify-end">
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
            <h3 className="mt-1 text-xl font-bold text-gray-900">Access summary</h3>

            <div className="mt-5 space-y-3">
              <div className="flex items-center gap-4 rounded-xl bg-gray-50 px-4 py-3">
                <CalendarDays className="h-5 w-5 text-gray-400" />
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-500">Joined</p>
                  <p className="text-sm font-semibold text-gray-900">{formatDate(user?.createdAt)}</p>
                </div>
              </div>

              <div className="flex items-center gap-4 rounded-xl bg-gray-50 px-4 py-3">
                <Shield className="h-5 w-5 text-gray-400" />
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-500">Role</p>
                  <p className="text-sm font-semibold text-gray-900">{formatLabel(user?.role)}</p>
                </div>
              </div>

              <div className="flex items-center gap-4 rounded-xl bg-gray-50 px-4 py-3">
                <BadgeCheck className="h-5 w-5 text-gray-400" />
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-500">Status</p>
                  <div className="mt-0.5">
                    <span className={`inline-flex rounded-md border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${badgeClassName(user?.status)}`}>
                      {formatLabel(user?.status)}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </div>


          <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
            <p className="text-xs font-semibold uppercase tracking-wider text-gray-500">Contact Snapshot</p>
            <div className="mt-4 space-y-3">
              <div className="flex items-center gap-3 text-sm text-gray-700">
                <Mail className="h-4 w-4 text-gray-400" />
                <span className="font-medium">{user?.email || '-'}</span>
              </div>
              <div className="flex items-center gap-3 text-sm text-gray-700">
                <Phone className="h-4 w-4 text-gray-400" />
                <span className="font-medium">{user?.mobile || user?.whatsappNumber || '-'}</span>
              </div>
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}
