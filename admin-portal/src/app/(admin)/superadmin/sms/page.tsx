'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import axios from 'axios';
import {
  AlertCircle,
  Briefcase,
  CheckCircle2,
  Eye,
  EyeOff,
  FileText,
  KeyRound,
  Loader2,
  RefreshCw,
  Save,
  Send,
  ShieldAlert,
  Smartphone,
  Store,
} from 'lucide-react';
import api from '@/lib/api';
import { useAuthStore } from '@/store/authStore';
import { hasPermission } from '@/lib/permissionUtils';

type SmsSettings = {
  enabled: boolean;
  ready: boolean;
  baseUrl: string;
  senderId: string;
  testRecipientPhoneMasked: string;
  smsDetails: string;
  credentials: { apiKeyConfigured: boolean };
};

type SmsRule = {
  id: string | null;
  eventCode: string;
  enabled: boolean;
  messageId: string | null;
  variablesTemplate: string | null;
};

type SmsLog = {
  id: string;
  eventCode: string;
  recipientType: string;
  recipientPhone: string;
  status: string;
  errorMessage?: string | null;
  createdAt: string;
  sentAt?: string | null;
  outbox?: { attempts: number; status: string; lastError?: string | null } | null;
};

const marketplaceEvents: Record<string, { title: string; recipient: string }> = {
  PARTNER_KYC_STATUS_UPDATED: { title: 'Partner KYC status updated', recipient: 'Partner' },
  PARTNER_LISTING_STATUS_UPDATED: { title: 'Partner listing status updated', recipient: 'Partner' },
  LISTING_PAYMENT_SUBMITTED: { title: 'Listing payment submitted', recipient: 'Customer' },
  LISTING_PAYMENT_APPROVED: { title: 'Listing payment approved', recipient: 'Customer / Partner' },
  LISTING_PAYMENT_REJECTED: { title: 'Listing payment rejected', recipient: 'Customer / Partner' },
  CUSTOMER_PRIME_APPROVED: { title: 'Customer Prime approved', recipient: 'Customer' },
  CUSTOMER_PRIME_REJECTED: { title: 'Customer Prime rejected', recipient: 'Customer' },
  MARKETPLACE_NEW_LISTING_PUBLISHED: { title: 'New vehicle listing published', recipient: 'Active customers' },
};

const recruitmentEvents: Record<string, { title: string; recipient: string }> = {
  RECRUITMENT_APPLICATION_RECEIVED: { title: 'Application received', recipient: 'Candidate' },
  RECRUITMENT_NEW_APPLICATION_SUPERADMIN: { title: 'New application alert', recipient: 'Super admin' },
  RECRUITMENT_NEW_APPLICATION_RECRUITER: { title: 'New application alert', recipient: 'Recruiter' },
  RECRUITMENT_APPLICATION_STAGE_UPDATED: { title: 'Application stage updated', recipient: 'Candidate' },
  RECRUITMENT_INTERVIEW_SCHEDULED: { title: 'Interview scheduled', recipient: 'Candidate' },
  RECRUITMENT_INTERVIEW_RESCHEDULED: { title: 'Interview rescheduled', recipient: 'Candidate' },
  RECRUITMENT_INTERVIEW_CANCELLED: { title: 'Interview cancelled', recipient: 'Candidate' },
  RECRUITMENT_OFFER_SENT: { title: 'Offer sent', recipient: 'Candidate' },
  RECRUITMENT_OFFER_STATUS_UPDATED: { title: 'Offer status updated', recipient: 'Candidate' },
  RECRUITMENT_NEW_JOB_PUBLISHED: { title: 'New job published', recipient: 'Candidates' },
};

const variableHelp = 'Optional: fill this only when the approved DLT template has variables. Use event values without braces, separated by |. Example: customerName|listingTitle|status.';

const errorText = (error: unknown, fallback: string) => (axios.isAxiosError(error) ? error.response?.data?.error || fallback : fallback);

function Toggle({ checked, disabled, onChange }: { checked: boolean; disabled?: boolean; onChange: (value: boolean) => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={`relative inline-flex h-7 w-12 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-[#FFC107] focus:ring-offset-2 ${
        checked ? 'bg-emerald-500' : 'bg-gray-300'
      } disabled:cursor-not-allowed disabled:opacity-60`}
    >
      <span
        className={`pointer-events-none inline-block h-6 w-6 transform rounded-full bg-white shadow-md ring-0 transition duration-200 ease-in-out ${
          checked ? 'translate-x-5' : 'translate-x-0'
        }`}
      />
    </button>
  );
}

function RuleCard({
  rule,
  details,
  canManage,
  saving,
  onSave,
}: {
  rule: SmsRule;
  details: { title: string; recipient: string };
  canManage: boolean;
  saving: boolean;
  onSave: (rule: SmsRule) => void;
}) {
  const [draft, setDraft] = useState(rule);

  return (
    <section className="rounded-2xl border border-gray-200/80 bg-white p-4 shadow-sm transition hover:shadow-md sm:p-5 lg:p-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h3 className="text-base font-bold text-gray-900 sm:text-lg">{details.title}</h3>
            <span
              className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                draft.enabled ? 'bg-emerald-100 text-emerald-800' : 'bg-gray-100 text-gray-600'
              }`}
            >
              {draft.enabled ? 'Active' : 'Disabled'}
            </span>
          </div>
          <p className="mt-1 text-xs text-gray-500 sm:text-sm">
            Recipient: <span className="font-semibold text-gray-700">{details.recipient}</span>
            <span className="mx-1.5 text-gray-300">•</span>
            Event: <code className="rounded bg-gray-100 px-1.5 py-0.5 font-mono text-xs text-gray-600">{rule.eventCode}</code>
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-3 self-end sm:self-center">
          <span className="text-xs font-bold uppercase tracking-wider text-gray-500">{draft.enabled ? 'On' : 'Off'}</span>
          <Toggle
            checked={draft.enabled}
            disabled={!canManage || saving}
            onChange={(enabled) => setDraft((current) => ({ ...current, enabled }))}
          />
        </div>
      </div>

      <div className="mt-5 grid gap-4.5 sm:grid-cols-1 md:grid-cols-2 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)_auto] lg:items-end">
        <div>
          <label className="block text-xs font-bold uppercase tracking-wider text-gray-700 sm:text-xs">
            DLT Message ID <span className="normal-case text-red-600 font-semibold">(required when enabled)</span>
          </label>
          <input
            value={draft.messageId || ''}
            onChange={(event) => setDraft((current) => ({ ...current, messageId: event.target.value.replace(/\D/g, '') }))}
            disabled={!canManage || saving}
            inputMode="numeric"
            placeholder="Approved DLT ID (e.g. 1707161...)"
            className="mt-1.5 h-11 w-full rounded-xl border border-gray-300 bg-white px-3.5 text-sm outline-none transition focus:border-[#FFC107] focus:ring-1 focus:ring-[#FFC107] disabled:bg-gray-100 disabled:text-gray-400"
          />
        </div>

        <div>
          <label className="block text-xs font-bold uppercase tracking-wider text-gray-700 sm:text-xs">
            Variable values order <span className="normal-case font-normal text-gray-500">(optional)</span>
          </label>
          <input
            value={draft.variablesTemplate || ''}
            onChange={(event) => setDraft((current) => ({ ...current, variablesTemplate: event.target.value }))}
            disabled={!canManage || saving}
            placeholder="Optional: customerName|listingTitle|status"
            className="mt-1.5 h-11 w-full rounded-xl border border-gray-300 bg-white px-3.5 text-sm outline-none transition focus:border-[#FFC107] focus:ring-1 focus:ring-[#FFC107] disabled:bg-gray-100 disabled:text-gray-400"
          />
        </div>

        <div className="pt-1 md:col-span-2 lg:col-span-1 lg:pt-0">
          <button
            type="button"
            disabled={!canManage || saving}
            onClick={() => onSave(draft)}
            className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-[#FFC107] px-5 text-sm font-bold text-black transition hover:bg-[#e5ad06] focus:outline-none focus:ring-2 focus:ring-[#FFC107] focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60 lg:w-auto"
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            Save Rule
          </button>
        </div>
      </div>

      <p className="mt-3 text-xs leading-relaxed text-gray-500">{variableHelp}</p>
    </section>
  );
}

export default function SmsNotificationsPage() {
  const { user } = useAuthStore();
  const canManage = user?.role === 'SUPER_ADMIN' || hasPermission(user?.permissions, 'sms.manage');
  const [tab, setTab] = useState<'SETTINGS' | 'MARKETPLACE' | 'RECRUITMENT' | 'LOGS'>('SETTINGS');
  const [settings, setSettings] = useState<SmsSettings | null>(null);
  const [form, setForm] = useState({
    enabled: false,
    apiKey: '',
    baseUrl: 'https://sms.flowitof.com/dev',
    senderId: '',
    testRecipientPhone: '',
    smsDetails: '0',
  });
  const [showApiKey, setShowApiKey] = useState(false);
  const [marketplace, setMarketplace] = useState<SmsRule[]>([]);
  const [recruitment, setRecruitment] = useState<SmsRule[]>([]);
  const [logs, setLogs] = useState<SmsLog[]>([]);
  const [testForm, setTestForm] = useState({ messageId: '', variablesValues: '' });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [savingRule, setSavingRule] = useState<string | null>(null);
  const [sendingTest, setSendingTest] = useState(false);
  const [retrying, setRetrying] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [dashboard, marketplaceResponse, recruitmentResponse, logsResponse] = await Promise.all([
        api.get<{ settings: SmsSettings }>('/sms/dashboard'),
        api.get<{ rules: SmsRule[] }>('/sms/marketplace-automations'),
        api.get<{ rules: SmsRule[] }>('/sms/recruitment-automations'),
        api.get<{ logs: SmsLog[] }>('/sms/logs?limit=50'),
      ]);
      setSettings(dashboard.data.settings);
      setForm((current) => ({
        ...current,
        enabled: dashboard.data.settings.enabled,
        baseUrl: dashboard.data.settings.baseUrl,
        senderId: dashboard.data.settings.senderId,
        smsDetails: dashboard.data.settings.smsDetails,
      }));
      setMarketplace(marketplaceResponse.data.rules);
      setRecruitment(recruitmentResponse.data.rules);
      setLogs(logsResponse.data.logs);
    } catch (requestError) {
      setError(errorText(requestError, 'Unable to load SMS settings.'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void load();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  const saveSettings = async () => {
    setSaving(true);
    setError('');
    setNotice('');
    try {
      const response = await api.put<{ message: string; settings: SmsSettings }>('/sms/settings', form);
      setSettings(response.data.settings);
      setForm((current) => ({ ...current, apiKey: '' }));
      setNotice(response.data.message);
    } catch (requestError) {
      setError(errorText(requestError, 'Unable to save SMS settings.'));
    } finally {
      setSaving(false);
    }
  };

  const saveRule = async (rule: SmsRule, group: 'marketplace' | 'recruitment') => {
    setSavingRule(rule.eventCode);
    setError('');
    setNotice('');
    try {
      const response = await api.put<{ message: string }>(`/sms/${group}-automations`, {
        eventCode: rule.eventCode,
        enabled: rule.enabled,
        messageId: rule.messageId || null,
        variablesTemplate: rule.variablesTemplate || null,
      });
      setNotice(response.data.message);
      const refreshed = await api.get<{ rules: SmsRule[] }>(`/sms/${group}-automations`);
      if (group === 'marketplace') setMarketplace(refreshed.data.rules);
      else setRecruitment(refreshed.data.rules);
    } catch (requestError) {
      setError(errorText(requestError, 'Unable to save SMS automation.'));
    } finally {
      setSavingRule(null);
    }
  };

  const sendTest = async () => {
    setSendingTest(true);
    setError('');
    setNotice('');
    try {
      const response = await api.post<{ message: string }>('/sms/settings/test-message', testForm);
      setNotice(response.data.message);
      const refreshed = await api.get<{ logs: SmsLog[] }>('/sms/logs?limit=50');
      setLogs(refreshed.data.logs);
    } catch (requestError) {
      setError(errorText(requestError, 'Unable to send test SMS.'));
    } finally {
      setSendingTest(false);
    }
  };

  const retry = async (log: SmsLog) => {
    setRetrying(log.id);
    setError('');
    setNotice('');
    try {
      const response = await api.post<{ message: string }>(`/sms/logs/${log.id}/retry`);
      setNotice(response.data.message);
      const refreshed = await api.get<{ logs: SmsLog[] }>('/sms/logs?limit=50');
      setLogs(refreshed.data.logs);
    } catch (requestError) {
      setError(errorText(requestError, 'Unable to retry SMS.'));
    } finally {
      setRetrying(null);
    }
  };

  const tabs = useMemo(
    () => [
      { id: 'SETTINGS' as const, label: 'Setup & Credentials', icon: KeyRound },
      { id: 'MARKETPLACE' as const, label: 'Marketplace Rules', icon: Store, count: marketplace.filter((r) => r.enabled).length },
      { id: 'RECRUITMENT' as const, label: 'Recruitment Rules', icon: Briefcase, count: recruitment.filter((r) => r.enabled).length },
      { id: 'LOGS' as const, label: 'Logs & Delivery', icon: FileText, count: logs.filter((l) => l.status === 'FAILED').length },
    ],
    [marketplace, recruitment, logs]
  );

  const failedCount = useMemo(() => logs.filter((log) => log.status === 'FAILED').length, [logs]);

  return (
    <div className="mx-auto max-w-7xl space-y-6 px-3 py-2 sm:px-6 sm:py-4 lg:px-8">
      {/* Overview Stat Cards */}
      <section className="grid grid-cols-1 gap-3.5 sm:grid-cols-3 sm:gap-4 lg:gap-5">
        <div className="relative overflow-hidden rounded-2xl border border-gray-200/80 bg-white p-4 shadow-sm transition hover:shadow-md sm:p-5">
          <div className="flex items-center justify-between">
            <p className="text-xs font-bold uppercase tracking-wider text-gray-500">Total Audit Logs</p>
            <div className="rounded-xl bg-amber-50 p-2 text-[#d99d00]">
              <FileText className="h-5 w-5" />
            </div>
          </div>
          <p className="mt-2 text-2xl font-black tracking-tight text-gray-900 sm:text-3xl">{loading ? '…' : logs.length}</p>
          <p className="mt-1 text-xs text-gray-500">Recent audit activity</p>
        </div>

        <div className="relative overflow-hidden rounded-2xl border border-gray-200/80 bg-white p-4 shadow-sm transition hover:shadow-md sm:p-5">
          <div className="flex items-center justify-between">
            <p className="text-xs font-bold uppercase tracking-wider text-gray-500">SMS Status</p>
            <div
              className={`rounded-xl p-2 ${
                settings?.ready && settings.enabled ? 'bg-emerald-50 text-emerald-600' : 'bg-gray-100 text-gray-400'
              }`}
            >
              <Smartphone className="h-5 w-5" />
            </div>
          </div>
          <div className="mt-2 flex items-center gap-2">
            <span
              className={`text-2xl font-black tracking-tight sm:text-3xl ${
                settings?.ready && settings.enabled ? 'text-emerald-600' : 'text-gray-400'
              }`}
            >
              {settings?.ready && settings.enabled ? 'ACTIVE' : 'OFF'}
            </span>
          </div>
          <p className="mt-1 text-xs text-gray-500">Global delivery switch</p>
        </div>

        <div className="relative overflow-hidden rounded-2xl border border-gray-200/80 bg-white p-4 shadow-sm transition hover:shadow-md sm:p-5">
          <div className="flex items-center justify-between">
            <p className="text-xs font-bold uppercase tracking-wider text-gray-500">Failed Messages</p>
            <div className={`rounded-xl p-2 ${failedCount > 0 ? 'bg-red-50 text-red-600' : 'bg-gray-100 text-gray-400'}`}>
              <ShieldAlert className="h-5 w-5" />
            </div>
          </div>
          <p className={`mt-2 text-2xl font-black tracking-tight sm:text-3xl ${failedCount > 0 ? 'text-red-600' : 'text-gray-900'}`}>
            {loading ? '…' : failedCount}
          </p>
          <p className="mt-1 text-xs text-gray-500">Retry available in logs</p>
        </div>
      </section>

      {/* Navigation Tabs - Responsive Scroll */}
      <nav
        aria-label="SMS module tabs"
        className="sticky top-0 z-20 flex gap-1.5 overflow-x-auto rounded-2xl border border-gray-200/80 bg-white/95 p-1.5 shadow-sm backdrop-blur-md transition-all sm:gap-2"
      >
        {tabs.map((item) => {
          const Icon = item.icon;
          const isActive = tab === item.id;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => setTab(item.id)}
              className={`flex shrink-0 flex-1 items-center justify-center gap-2 rounded-xl px-3.5 py-2.5 text-xs font-bold transition sm:text-sm ${
                isActive
                  ? 'bg-[#FFC107] text-black shadow-sm'
                  : 'text-gray-600 hover:bg-gray-100/80 hover:text-gray-900'
              }`}
            >
              <Icon className="h-4 w-4 shrink-0" />
              <span className="whitespace-nowrap">{item.label}</span>
              {Boolean(item.count) && (
                <span
                  className={`ml-0.5 rounded-full px-2 py-0.5 text-[10px] font-extrabold ${
                    isActive
                      ? 'bg-black/10 text-black'
                      : item.id === 'LOGS'
                      ? 'bg-red-100 text-red-700'
                      : 'bg-gray-200 text-gray-700'
                  }`}
                >
                  {item.count}
                </span>
              )}
            </button>
          );
        })}
      </nav>

      {/* Alerts & Notifications */}
      {error && (
        <div
          role="alert"
          className="flex items-start gap-3 rounded-2xl border border-red-200 bg-red-50/90 p-4 text-sm font-semibold text-red-800 shadow-sm"
        >
          <AlertCircle className="h-5 w-5 shrink-0 text-red-600" />
          <div className="flex-1">{error}</div>
        </div>
      )}
      {notice && (
        <div
          role="status"
          className="flex items-start gap-3 rounded-2xl border border-emerald-200 bg-emerald-50/90 p-4 text-sm font-semibold text-emerald-800 shadow-sm"
        >
          <CheckCircle2 className="h-5 w-5 shrink-0 text-emerald-600" />
          <div className="flex-1">{notice}</div>
        </div>
      )}

      {/* Tab 1: Setup & Credentials */}
      {tab === 'SETTINGS' && (
        <div className="space-y-6">
          <section className="rounded-2xl border border-gray-200/80 bg-white p-4 shadow-sm sm:p-6 lg:p-7">
            <div className="flex flex-col gap-4 border-b border-gray-100 pb-5 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-start gap-3">
                <div className="rounded-xl bg-amber-50 p-2.5 text-[#d99d00] shrink-0">
                  <Smartphone className="h-6 w-6" />
                </div>
                <div>
                  <h2 className="text-lg font-bold text-gray-900 sm:text-xl">SMS Gateway Settings</h2>
                  <p className="mt-0.5 text-xs text-gray-500 sm:text-sm">
                    Configure your TRAI DLT provider credentials to enable automated SMS notifications across the platform.
                  </p>
                </div>
              </div>
              <div className="flex shrink-0 items-center gap-3 self-start rounded-xl border border-gray-200 bg-gray-50/80 px-3.5 py-2 text-sm font-bold sm:self-center">
                <span className={form.enabled ? 'text-emerald-700' : 'text-gray-500'}>{form.enabled ? 'Enabled' : 'Disabled'}</span>
                <Toggle
                  checked={form.enabled}
                  disabled={!canManage || saving}
                  onChange={(enabled) => setForm((current) => ({ ...current, enabled }))}
                />
              </div>
            </div>

            <div className="mt-6 grid gap-5 sm:grid-cols-1 md:grid-cols-2">
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-gray-700">
                  SMS API Key <span className="normal-case font-normal text-gray-500">(required for initial setup)</span>
                </label>
                <div className="relative mt-1.5">
                  <input
                    type={showApiKey ? 'text' : 'password'}
                    value={form.apiKey}
                    onChange={(event) => setForm((current) => ({ ...current, apiKey: event.target.value }))}
                    disabled={!canManage || saving}
                    placeholder={settings?.credentials.apiKeyConfigured ? '••••••••  (Leave blank to keep existing key)' : 'Enter API Key (required)'}
                    className="h-11 w-full rounded-xl border border-gray-300 bg-white pl-3.5 pr-10 text-sm outline-none transition focus:border-[#FFC107] focus:ring-1 focus:ring-[#FFC107] disabled:bg-gray-100 disabled:text-gray-400"
                  />
                  <button
                    type="button"
                    onClick={() => setShowApiKey(!showApiKey)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 focus:outline-none"
                    aria-label={showApiKey ? 'Hide API key' : 'Show API key'}
                  >
                    {showApiKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-gray-700">
                  DLT Sender ID <span className="normal-case font-semibold text-red-600">(required to enable)</span>
                </label>
                <input
                  value={form.senderId}
                  onChange={(event) => setForm((current) => ({ ...current, senderId: event.target.value.toUpperCase() }))}
                  disabled={!canManage || saving}
                  placeholder="Approved Sender ID (e.g. JCBEXC)"
                  className="mt-1.5 h-11 w-full rounded-xl border border-gray-300 bg-white px-3.5 text-sm uppercase outline-none transition focus:border-[#FFC107] focus:ring-1 focus:ring-[#FFC107] disabled:bg-gray-100 disabled:text-gray-400"
                />
              </div>

              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-gray-700">
                  SMS Provider Base URL <span className="normal-case font-normal text-gray-500">(optional)</span>
                </label>
                <input
                  value={form.baseUrl}
                  onChange={(event) => setForm((current) => ({ ...current, baseUrl: event.target.value }))}
                  disabled={!canManage || saving}
                  placeholder="Default: https://sms.flowitof.com/dev"
                  className="mt-1.5 h-11 w-full rounded-xl border border-gray-300 bg-white px-3.5 text-sm outline-none transition focus:border-[#FFC107] focus:ring-1 focus:ring-[#FFC107] disabled:bg-gray-100 disabled:text-gray-400"
                />
              </div>

              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-gray-700">
                  Test Recipient Number <span className="normal-case font-normal text-gray-500">(optional, for test SMS)</span>
                </label>
                <input
                  value={form.testRecipientPhone}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      testRecipientPhone: event.target.value.replace(/\D/g, '').slice(0, 10),
                    }))
                  }
                  disabled={!canManage || saving}
                  placeholder={settings?.testRecipientPhoneMasked || 'Optional: 10-digit Indian mobile number'}
                  inputMode="numeric"
                  className="mt-1.5 h-11 w-full rounded-xl border border-gray-300 bg-white px-3.5 text-sm outline-none transition focus:border-[#FFC107] focus:ring-1 focus:ring-[#FFC107] disabled:bg-gray-100 disabled:text-gray-400"
                />
              </div>

              <div className="md:col-span-2">
                <label className="block text-xs font-bold uppercase tracking-wider text-gray-700">
                  Include SMS details <span className="normal-case font-normal text-gray-500">(optional)</span>
                </label>
                <select
                  value={form.smsDetails}
                  onChange={(event) => setForm((current) => ({ ...current, smsDetails: event.target.value }))}
                  disabled={!canManage || saving}
                  className="mt-1.5 h-11 w-full rounded-xl border border-gray-300 bg-white px-3.5 text-sm outline-none transition focus:border-[#FFC107] focus:ring-1 focus:ring-[#FFC107] disabled:bg-gray-100 disabled:text-gray-400"
                >
                  <option value="0">No (default)</option>
                  <option value="1">Yes</option>
                </select>
              </div>
            </div>

            <div className="mt-6 flex flex-col gap-4 rounded-xl border border-amber-200/70 bg-amber-50/80 p-4 text-xs font-medium text-amber-900 sm:flex-row sm:items-center sm:justify-between sm:text-sm">
              <span className="leading-relaxed">
                Ensure you use TRAI-approved DLT Sender IDs & Message IDs. API keys stay securely encrypted (AES-256-GCM) on the server.
              </span>
              <button
                type="button"
                onClick={() => void saveSettings()}
                disabled={!canManage || saving}
                className="inline-flex h-11 items-center justify-center gap-2 shrink-0 rounded-xl bg-[#FFC107] px-5 font-bold text-black transition hover:bg-[#e5ad06] focus:outline-none focus:ring-2 focus:ring-[#FFC107] focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                Save Settings
              </button>
            </div>
          </section>

          {/* Send Test SMS Section */}
          <section className="rounded-2xl border border-gray-200/80 bg-white p-4 shadow-sm sm:p-6 lg:p-7">
            <div className="flex items-start gap-3">
              <div className="rounded-xl bg-sky-50 p-2.5 text-sky-700 shrink-0">
                <Send className="h-6 w-6" />
              </div>
              <div>
                <h2 className="text-lg font-bold text-gray-900 sm:text-xl">Send Test SMS</h2>
                <p className="mt-0.5 text-xs text-gray-500 sm:text-sm">
                  Ensure a test recipient number is saved in settings. DLT Message ID is required; variable values are optional if the template contains no variables.
                </p>
              </div>
            </div>

            <div className="mt-5 grid gap-3 sm:grid-cols-1 md:grid-cols-2 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.5fr)_auto] lg:items-end">
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-gray-700">
                  DLT Message ID <span className="normal-case font-semibold text-red-600">(required)</span>
                </label>
                <input
                  value={testForm.messageId}
                  onChange={(event) => setTestForm((current) => ({ ...current, messageId: event.target.value.replace(/\D/g, '') }))}
                  disabled={!canManage || sendingTest}
                  placeholder="DLT Message ID (e.g. 1707161...)"
                  inputMode="numeric"
                  className="mt-1.5 h-11 w-full rounded-xl border border-gray-300 bg-white px-3.5 text-sm outline-none transition focus:border-[#FFC107] focus:ring-1 focus:ring-[#FFC107] disabled:bg-gray-100"
                />
              </div>

              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-gray-700">
                  Variables values <span className="normal-case font-normal text-gray-500">(optional)</span>
                </label>
                <input
                  value={testForm.variablesValues}
                  onChange={(event) => setTestForm((current) => ({ ...current, variablesValues: event.target.value }))}
                  disabled={!canManage || sendingTest}
                  placeholder="Optional: Rahul|1234"
                  className="mt-1.5 h-11 w-full rounded-xl border border-gray-300 bg-white px-3.5 text-sm outline-none transition focus:border-[#FFC107] focus:ring-1 focus:ring-[#FFC107] disabled:bg-gray-100"
                />
              </div>

              <div className="pt-1 md:col-span-2 lg:col-span-1 lg:pt-0">
                <button
                  type="button"
                  onClick={() => void sendTest()}
                  disabled={!canManage || sendingTest || !settings?.ready}
                  className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-gray-900 px-5 text-sm font-bold text-white transition hover:bg-black focus:outline-none focus:ring-2 focus:ring-gray-900 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 lg:w-auto"
                >
                  {sendingTest ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                  Send Test SMS
                </button>
              </div>
            </div>
          </section>
        </div>
      )}

      {/* Tab 2: Marketplace Rules */}
      {tab === 'MARKETPLACE' && (
        <div className="space-y-4">
          <div className="rounded-2xl border border-blue-100 bg-blue-50/80 p-4 text-xs text-blue-900 sm:text-sm">
            Configure automated DLT SMS rules triggered by customer and partner marketplace events (KYC updates, payment approvals, Prime membership).
          </div>
          {marketplace.map((rule) => (
            <RuleCard
              key={`${rule.eventCode}-${rule.enabled}-${rule.messageId || ''}-${rule.variablesTemplate || ''}`}
              rule={rule}
              details={marketplaceEvents[rule.eventCode] || { title: rule.eventCode, recipient: 'Configured recipient' }}
              canManage={canManage}
              saving={savingRule === rule.eventCode}
              onSave={(draft) => void saveRule(draft, 'marketplace')}
            />
          ))}
        </div>
      )}

      {/* Tab 3: Recruitment Rules */}
      {tab === 'RECRUITMENT' && (
        <div className="space-y-4">
          <div className="rounded-2xl border border-purple-100 bg-purple-50/80 p-4 text-xs text-purple-900 sm:text-sm">
            Configure automated DLT SMS rules triggered by recruitment events (Job applications, interview schedules, offer letters).
          </div>
          {recruitment.map((rule) => (
            <RuleCard
              key={`${rule.eventCode}-${rule.enabled}-${rule.messageId || ''}-${rule.variablesTemplate || ''}`}
              rule={rule}
              details={recruitmentEvents[rule.eventCode] || { title: rule.eventCode, recipient: 'Configured recipient' }}
              canManage={canManage}
              saving={savingRule === rule.eventCode}
              onSave={(draft) => void saveRule(draft, 'recruitment')}
            />
          ))}
        </div>
      )}

      {/* Tab 4: Logs & Delivery */}
      {tab === 'LOGS' && (
        <section className="overflow-hidden rounded-2xl border border-gray-200/80 bg-white shadow-sm">
          <div className="flex flex-col gap-3 border-b border-gray-100 p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5">
            <div>
              <h2 className="text-base font-bold text-gray-900 sm:text-lg">SMS Delivery Audit Logs</h2>
              <p className="mt-0.5 text-xs text-gray-500 sm:text-sm">
                Real-time provider acceptance, delivery statuses, and failed dispatch logs.
              </p>
            </div>
            <button
              type="button"
              onClick={() => void load()}
              className="inline-flex h-9 items-center justify-center gap-2 rounded-xl border border-gray-300 bg-white px-3.5 text-xs font-bold text-gray-700 transition hover:bg-gray-50 focus:outline-none self-start sm:self-auto"
            >
              <RefreshCw className="h-3.5 w-3.5" />
              Refresh Logs
            </button>
          </div>

          {/* Desktop Table View */}
          <div className="hidden overflow-x-auto md:block">
            <table className="w-full text-left text-sm">
              <thead className="bg-gray-50/80 text-xs font-bold uppercase tracking-wider text-gray-500 border-b border-gray-100">
                <tr>
                  <th className="px-5 py-3.5">Event</th>
                  <th className="px-5 py-3.5">Recipient</th>
                  <th className="px-5 py-3.5">Status</th>
                  <th className="px-5 py-3.5">Date & Time</th>
                  <th className="px-5 py-3.5 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {logs.map((log) => (
                  <tr key={log.id} className="transition hover:bg-gray-50/50">
                    <td className="px-5 py-4">
                      <p className="font-bold text-gray-900">{log.eventCode}</p>
                      {log.errorMessage && (
                        <p className="mt-1 max-w-md rounded bg-red-50 p-1.5 font-mono text-xs text-red-600">
                          {log.errorMessage}
                        </p>
                      )}
                    </td>
                    <td className="px-5 py-4">
                      <span className="font-semibold text-gray-800">{log.recipientType}</span>
                      <br />
                      <span className="font-mono text-xs text-gray-500">{log.recipientPhone}</span>
                    </td>
                    <td className="px-5 py-4">
                      <span
                        className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-extrabold ${
                          log.status === 'SENT'
                            ? 'bg-emerald-100 text-emerald-800'
                            : log.status === 'FAILED'
                            ? 'bg-red-100 text-red-800'
                            : 'bg-gray-100 text-gray-700'
                        }`}
                      >
                        {log.status}
                      </span>
                    </td>
                    <td className="px-5 py-4 text-xs text-gray-500 whitespace-nowrap">
                      {new Date(log.createdAt).toLocaleString('en-IN', {
                        day: '2-digit',
                        month: 'short',
                        year: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </td>
                    <td className="px-5 py-4 text-right">
                      {log.status === 'FAILED' && (
                        <button
                          type="button"
                          onClick={() => void retry(log)}
                          disabled={!canManage || retrying === log.id}
                          className="inline-flex items-center gap-1.5 rounded-lg bg-[#FFC107] px-3 py-1.5 text-xs font-bold text-black transition hover:bg-[#e5ad06] disabled:opacity-50"
                        >
                          {retrying === log.id ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          ) : (
                            <RefreshCw className="h-3.5 w-3.5" />
                          )}
                          Retry
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
                {!logs.length && (
                  <tr>
                    <td colSpan={5} className="px-5 py-12 text-center text-gray-500">
                      No SMS activity logs recorded yet.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {/* Mobile Card List View */}
          <div className="divide-y divide-gray-100 md:hidden">
            {logs.map((log) => (
              <div key={log.id} className="p-4 space-y-2">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="font-bold text-gray-900 text-sm">{log.eventCode}</p>
                    <p className="text-xs text-gray-500 mt-0.5">
                      To: <span className="font-semibold text-gray-700">{log.recipientType}</span> ({log.recipientPhone})
                    </p>
                  </div>
                  <span
                    className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-extrabold ${
                      log.status === 'SENT'
                        ? 'bg-emerald-100 text-emerald-800'
                        : log.status === 'FAILED'
                        ? 'bg-red-100 text-red-800'
                        : 'bg-gray-100 text-gray-700'
                    }`}
                  >
                    {log.status}
                  </span>
                </div>

                {log.errorMessage && (
                  <p className="rounded bg-red-50 p-2 font-mono text-xs text-red-600">
                    {log.errorMessage}
                  </p>
                )}

                <div className="flex items-center justify-between pt-1 text-xs text-gray-400">
                  <span>
                    {new Date(log.createdAt).toLocaleString('en-IN', {
                      day: '2-digit',
                      month: 'short',
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </span>

                  {log.status === 'FAILED' && (
                    <button
                      type="button"
                      onClick={() => void retry(log)}
                      disabled={!canManage || retrying === log.id}
                      className="inline-flex items-center gap-1 rounded-lg bg-[#FFC107] px-2.5 py-1 text-xs font-bold text-black disabled:opacity-50"
                    >
                      {retrying === log.id ? (
                        <Loader2 className="h-3 w-3 animate-spin" />
                      ) : (
                        <RefreshCw className="h-3 w-3" />
                      )}
                      Retry
                    </button>
                  )}
                </div>
              </div>
            ))}
            {!logs.length && (
              <div className="p-8 text-center text-xs text-gray-500">
                No SMS activity logs recorded yet.
              </div>
            )}
          </div>
        </section>
      )}
    </div>
  );
}
