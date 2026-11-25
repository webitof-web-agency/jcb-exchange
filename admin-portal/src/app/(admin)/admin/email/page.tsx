'use client';

/* eslint-disable react-hooks/set-state-in-effect, react-hooks/exhaustive-deps */

import { useEffect, useState } from 'react';
import axios from 'axios';
import {
  AlertCircle,
  Briefcase,
  CheckCircle2,
  Eye,
  EyeOff,
  FileText,
  KeyRound,
  LockKeyhole,
  Mail,
  RefreshCw,
  Save,
  Send,
  Server,
  ShieldCheck,
  Store,
} from 'lucide-react';
import api from '@/lib/api';
import { useAuthStore } from '@/store/authStore';
import { hasPermission } from '@/lib/permissionUtils';
import EmailTemplateLibrary from '@/components/email/EmailTemplateLibrary';

type EmailSettings = {
  enabled: boolean;
  ready: boolean;
  smtpHost: string;
  smtpPort: number;
  smtpSecure: boolean;
  senderEmail: string;
  senderEmailMasked: string;
  senderName: string;
  replyToEmail: string;
  smtpPassword: string;
  credentials: {
    senderConfigured: boolean;
    passwordConfigured: boolean;
    encryptionKeyConfigured: boolean;
    ready: boolean;
  };
  lastTestedAt: string | null;
  lastTestStatus: 'SUCCESS' | 'FAILED' | null;
  lastTestError: string | null;
  updatedAt: string | null;
};

type EmailForm = {
  enabled: boolean;
  smtpHost: string;
  smtpPort: string;
  smtpSecure: boolean;
  senderEmail: string;
  senderName: string;
  replyToEmail: string;
  smtpPassword: string;
};

type EmailLog = {
  id: string;
  eventCode: string;
  recipientEmail: string;
  subject: string;
  status: 'QUEUED' | 'SENT' | 'FAILED' | 'SKIPPED';
  errorMessage: string | null;
  sentAt: string | null;
  createdAt: string;
  outbox?: {
    attempts: number;
    status: string;
    nextAttemptAt: string | null;
    processedAt: string | null;
    lastError: string | null;
  } | null;
};

type EmailTab = 'SETTINGS' | 'MARKETPLACE' | 'RECRUITMENT' | 'LOGS';

const emptyForm: EmailForm = {
  enabled: false,
  smtpHost: 'smtp.gmail.com',
  smtpPort: '465',
  smtpSecure: true,
  senderEmail: '',
  senderName: 'JCB Exchange',
  replyToEmail: '',
  smtpPassword: '',
};

const errorText = (error: unknown, fallback: string) =>
  axios.isAxiosError(error) ? error.response?.data?.error || fallback : fallback;

function Toggle({ checked, disabled, onChange }: { checked: boolean; disabled?: boolean; onChange: (value: boolean) => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={`relative inline-flex h-7 w-12 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-[#FFC107] focus:ring-offset-2 ${
        checked ? 'bg-emerald-500' : 'bg-gray-300'
      } disabled:cursor-not-allowed disabled:opacity-60`}
    >
      <span
        className={`pointer-events-none inline-block h-6 w-6 transform rounded-full bg-white shadow-md transition duration-200 ${
          checked ? 'translate-x-5' : 'translate-x-0'
        }`}
      />
    </button>
  );
}

export default function EmailSettingsPage() {
  const user = useAuthStore((state) => state.user);
  const isSuperAdmin = user?.role === 'SUPER_ADMIN' || user?.role === 'ADMIN';
  const canRead = isSuperAdmin || hasPermission(user?.permissions, 'email.read') || hasPermission(user?.permissions, 'email.manage');
  const canManage = isSuperAdmin || hasPermission(user?.permissions, 'email.manage');

  const [settings, setSettings] = useState<EmailSettings | null>(null);
  const [form, setForm] = useState<EmailForm>(emptyForm);
  const [testRecipient, setTestRecipient] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testingConnection, setTestingConnection] = useState(false);
  const [sendingTest, setSendingTest] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [logs, setLogs] = useState<EmailLog[]>([]);
  const [retryingLogId, setRetryingLogId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<EmailTab>('SETTINGS');

  const loadSettings = async () => {
    setLoading(true);
    setError('');
    try {
      const response = await api.get<{ settings: EmailSettings }>('/email/settings');
      const next = response.data.settings;
      setSettings(next);
      setForm({
        enabled: next.enabled,
        smtpHost: next.smtpHost,
        smtpPort: String(next.smtpPort),
        smtpSecure: next.smtpSecure,
        senderEmail: next.senderEmail,
        senderName: next.senderName,
        replyToEmail: next.replyToEmail,
        smtpPassword: '',
      });
    } catch (requestError) {
      setError(errorText(requestError, 'Unable to load transactional email settings.'));
    } finally {
      setLoading(false);
    }
  };

  const loadLogs = async () => {
    try {
      const response = await api.get<{ logs: EmailLog[] }>('/email/logs?limit=25');
      setLogs(response.data.logs || []);
    } catch (requestError) {
      setError(errorText(requestError, 'Unable to load email delivery logs.'));
    }
  };

  useEffect(() => {
    if (canRead) {
      void loadSettings();
      void loadLogs();
    }
  }, [canRead]);

  const updateField = <K extends keyof EmailForm>(field: K, value: EmailForm[K]) => {
    setForm((current) => ({ ...current, [field]: value }));
  };

  const saveSettings = async () => {
    setSaving(true);
    setError('');
    setNotice('');
    try {
      const response = await api.put<{ message: string; settings: EmailSettings }>('/email/settings', {
        ...form,
        smtpPort: Number(form.smtpPort),
        ...(form.smtpPassword ? { smtpPassword: form.smtpPassword } : {}),
      });
      setSettings(response.data.settings);
      setForm((current) => ({ ...current, smtpPassword: '' }));
      setNotice(response.data.message);
    } catch (requestError) {
      setError(errorText(requestError, 'Unable to save transactional email settings.'));
    } finally {
      setSaving(false);
    }
  };

  const testConnection = async () => {
    setTestingConnection(true);
    setError('');
    setNotice('');
    try {
      const response = await api.post<{ message: string }>('/email/settings/test-connection');
      setNotice(response.data.message);
      await loadSettings();
      await loadLogs();
    } catch (requestError) {
      setError(errorText(requestError, 'Unable to verify SMTP connection.'));
      await loadSettings();
    } finally {
      setTestingConnection(false);
    }
  };

  const sendTestEmail = async () => {
    setSendingTest(true);
    setError('');
    setNotice('');
    try {
      const response = await api.post<{ message: string }>('/email/settings/test-email', { to: testRecipient });
      setNotice(response.data.message);
      await loadSettings();
      await loadLogs();
    } catch (requestError) {
      setError(errorText(requestError, 'Unable to send test email.'));
      await loadSettings();
      await loadLogs();
    } finally {
      setSendingTest(false);
    }
  };

  const retryLog = async (log: EmailLog) => {
    if (!canManage) return;
    setRetryingLogId(log.id);
    setError('');
    setNotice('');
    try {
      await api.post(`/email/logs/${log.id}/retry`);
      // Worded here: the endpoint serves every event, not only offer emails. A failed / queued email is retried on
      // the same delivery row; a sent one is sent again as a new row.
      setNotice(log.status === 'SENT' ? 'Email queued to be sent again.' : 'Email queued for another delivery attempt.');
      await loadLogs();
    } catch (requestError) {
      setError(errorText(requestError, 'Unable to retry email delivery.'));
    } finally {
      setRetryingLogId(null);
    }
  };

  if (!canRead) {
    return (
      <div className="mx-auto max-w-5xl p-6 text-sm font-semibold text-gray-600">
        You do not have permission to view Email Communications.
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-7xl space-y-6 px-3 py-2 sm:px-6 sm:py-4 lg:px-8">
      {/* Top Metrics Cards */}
      <section className="grid grid-cols-1 gap-3.5 sm:grid-cols-3 sm:gap-4 lg:gap-5">
        <div className="rounded-2xl border border-gray-200/80 bg-white p-4 shadow-sm sm:p-5">
          <div className="flex items-center justify-between">
            <p className="text-xs font-bold uppercase tracking-wider text-gray-500">Email Status</p>
            <div className={`rounded-xl p-2 ${settings?.ready && settings.enabled ? 'bg-emerald-50 text-emerald-600' : 'bg-gray-100 text-gray-400'}`}>
              <Mail className="h-5 w-5" />
            </div>
          </div>
          <p className="mt-2 text-2xl font-black tracking-tight text-gray-900">
            {loading ? '…' : settings?.ready && settings.enabled ? 'Active' : 'Off'}
          </p>
          <p className="mt-1 text-xs text-gray-500">Transactional email delivery</p>
        </div>

        <div className="rounded-2xl border border-gray-200/80 bg-white p-4 shadow-sm sm:p-5">
          <div className="flex items-center justify-between">
            <p className="text-xs font-bold uppercase tracking-wider text-gray-500">SMTP Provider</p>
            <div className="rounded-xl bg-amber-50 p-2 text-[#d99d00]">
              <Server className="h-5 w-5" />
            </div>
          </div>
          <p className="mt-2 truncate text-lg font-black tracking-tight text-gray-900">
            {settings?.smtpHost || 'Not configured'}
          </p>
          <p className="mt-1 text-xs text-gray-500">
            {settings?.smtpPort ? `Port ${settings.smtpPort}` : 'Add SMTP credentials below'}
          </p>
        </div>

        <div className="rounded-2xl border border-gray-200/80 bg-white p-4 shadow-sm sm:p-5">
          <div className="flex items-center justify-between">
            <p className="text-xs font-bold uppercase tracking-wider text-gray-500">Security</p>
            <div className="rounded-xl bg-sky-50 p-2 text-sky-700">
              <ShieldCheck className="h-5 w-5" />
            </div>
          </div>
          <p className="mt-2 text-lg font-black tracking-tight text-gray-900">
            {settings?.credentials.encryptionKeyConfigured ? 'Encrypted' : 'Needs setup'}
          </p>
          <p className="mt-1 text-xs text-gray-500">SMTP password stays masked</p>
        </div>
      </section>

      {/* Error & Notice Banners */}
      {error ? (
        <div role="alert" className="flex items-start gap-3 rounded-2xl border border-red-200 bg-red-50/90 p-4 text-sm font-semibold text-red-800 shadow-sm">
          <AlertCircle className="h-5 w-5 shrink-0 text-red-600" />
          <span>{error}</span>
        </div>
      ) : null}
      {notice ? (
        <div role="status" className="flex items-start gap-3 rounded-2xl border border-emerald-200 bg-emerald-50/90 p-4 text-sm font-semibold text-emerald-800 shadow-sm">
          <CheckCircle2 className="h-5 w-5 shrink-0 text-emerald-600" />
          <span>{notice}</span>
        </div>
      ) : null}

      {/* Tabs Navigation */}
      <nav aria-label="Email communication sections" className="flex flex-wrap gap-2 rounded-2xl border border-gray-200/80 bg-white p-2 shadow-sm">
        {[
          { id: 'SETTINGS' as const, label: 'Setup & Credentials', icon: KeyRound },
          { id: 'MARKETPLACE' as const, label: 'Marketplace Rules', icon: Store },
          { id: 'RECRUITMENT' as const, label: 'Recruitment Rules', icon: Briefcase },
          { id: 'LOGS' as const, label: 'Logs & Delivery', icon: FileText },
        ].map((tab) => {
          const Icon = tab.icon;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              aria-current={activeTab === tab.id ? 'page' : undefined}
              className={`inline-flex flex-1 items-center justify-center gap-2 rounded-xl px-3 py-3 text-xs font-bold transition sm:flex-none sm:px-5 ${
                activeTab === tab.id ? 'bg-[#FFC107] text-black shadow-sm' : 'text-slate-600 hover:bg-slate-50'
              }`}
            >
              <Icon className="h-4 w-4" />
              {tab.label}
            </button>
          );
        })}
      </nav>

      {/* Tab: Settings */}
      {activeTab === 'SETTINGS' ? (
        <>
          <section className="rounded-2xl border border-gray-200/80 bg-white p-4 shadow-sm sm:p-6 lg:p-7">
            <div className="flex flex-col gap-4 border-b border-gray-100 pb-5 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-start gap-3">
                <div className="shrink-0 rounded-xl bg-amber-50 p-2.5 text-[#d99d00]">
                  <Mail className="h-6 w-6" />
                </div>
                <div>
                  <h1 className="text-lg font-bold text-gray-900 sm:text-xl">Transactional Email Settings</h1>
                  <p className="mt-1 text-xs text-gray-500 sm:text-sm">
                    Configure SMTP once for offer letters, recruitment updates and system email automations.
                  </p>
                </div>
              </div>
              <div className="flex shrink-0 items-center gap-3 self-start rounded-xl border border-gray-200 bg-gray-50/80 px-3.5 py-2 text-sm font-bold sm:self-center">
                <span className={form.enabled ? 'text-emerald-700' : 'text-gray-500'}>{form.enabled ? 'Enabled' : 'Disabled'}</span>
                <Toggle checked={form.enabled} disabled={!canManage || saving} onChange={(value) => updateField('enabled', value)} />
              </div>
            </div>

            <div className="mt-6 grid gap-5 sm:grid-cols-2">
              <label className="block text-xs font-bold uppercase tracking-wider text-gray-700">
                SMTP host
                <input
                  value={form.smtpHost}
                  onChange={(event) => updateField('smtpHost', event.target.value)}
                  disabled={!canManage || saving}
                  placeholder="smtp.gmail.com"
                  className="mt-1.5 h-11 w-full rounded-xl border border-gray-300 bg-white px-3.5 text-sm font-medium normal-case outline-none transition focus:border-[#FFC107] focus:ring-1 focus:ring-[#FFC107] disabled:bg-gray-100"
                />
              </label>

              <label className="block text-xs font-bold uppercase tracking-wider text-gray-700">
                SMTP port
                <input
                  value={form.smtpPort}
                  onChange={(event) => updateField('smtpPort', event.target.value.replace(/\D/g, ''))}
                  disabled={!canManage || saving}
                  inputMode="numeric"
                  placeholder="465"
                  className="mt-1.5 h-11 w-full rounded-xl border border-gray-300 bg-white px-3.5 text-sm font-medium normal-case outline-none transition focus:border-[#FFC107] focus:ring-1 focus:ring-[#FFC107] disabled:bg-gray-100"
                />
              </label>

              <label className="block text-xs font-bold uppercase tracking-wider text-gray-700">
                Sender email
                <input
                  type="email"
                  value={form.senderEmail}
                  onChange={(event) => updateField('senderEmail', event.target.value)}
                  disabled={!canManage || saving}
                  placeholder="hr@yourcompany.com"
                  className="mt-1.5 h-11 w-full rounded-xl border border-gray-300 bg-white px-3.5 text-sm font-medium normal-case outline-none transition focus:border-[#FFC107] focus:ring-1 focus:ring-[#FFC107] disabled:bg-gray-100"
                />
              </label>

              <label className="block text-xs font-bold uppercase tracking-wider text-gray-700">
                Sender name
                <input
                  value={form.senderName}
                  onChange={(event) => updateField('senderName', event.target.value)}
                  disabled={!canManage || saving}
                  placeholder="JCB Exchange HR"
                  className="mt-1.5 h-11 w-full rounded-xl border border-gray-300 bg-white px-3.5 text-sm font-medium normal-case outline-none transition focus:border-[#FFC107] focus:ring-1 focus:ring-[#FFC107] disabled:bg-gray-100"
                />
              </label>

              <label className="block text-xs font-bold uppercase tracking-wider text-gray-700">
                Reply-to email <span className="normal-case font-normal text-gray-500">(optional)</span>
                <input
                  type="email"
                  value={form.replyToEmail}
                  onChange={(event) => updateField('replyToEmail', event.target.value)}
                  disabled={!canManage || saving}
                  placeholder="replies@yourcompany.com"
                  className="mt-1.5 h-11 w-full rounded-xl border border-gray-300 bg-white px-3.5 text-sm font-medium normal-case outline-none transition focus:border-[#FFC107] focus:ring-1 focus:ring-[#FFC107] disabled:bg-gray-100"
                />
              </label>

              <div>
                <div className="flex items-center justify-between gap-3">
                  <label className="block text-xs font-bold uppercase tracking-wider text-gray-700">SMTP password / app password</label>
                  {settings?.credentials.passwordConfigured ? (
                    <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-1 text-[10px] font-bold uppercase tracking-wide text-emerald-700">
                      <CheckCircle2 className="h-3 w-3" /> Saved securely
                    </span>
                  ) : null}
                </div>
                <div className="relative mt-1.5">
                  <input
                    type={showPassword ? 'text' : 'password'}
                    value={form.smtpPassword}
                    onChange={(event) => updateField('smtpPassword', event.target.value)}
                    autoComplete="new-password"
                    disabled={!canManage || saving}
                    placeholder={settings?.credentials.passwordConfigured ? 'Enter only to replace saved password' : 'Enter SMTP password or app password'}
                    className="h-11 w-full rounded-xl border border-gray-300 bg-white px-3.5 pr-10 text-sm outline-none transition focus:border-[#FFC107] focus:ring-1 focus:ring-[#FFC107] disabled:bg-gray-100"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((value) => !value)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                    aria-label={showPassword ? 'Hide SMTP password' : 'Show SMTP password'}
                  >
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>
            </div>

            <div className="mt-5 grid gap-4 rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-700 md:grid-cols-2">
              <label className="flex cursor-pointer items-start gap-3">
                <input
                  type="radio"
                  checked={form.smtpSecure}
                  onChange={() => updateField('smtpSecure', true)}
                  disabled={!canManage || saving}
                  className="mt-1 accent-[#FFC107]"
                />
                <span>
                  <strong className="block text-slate-900">SSL / secure connection</strong>
                  <span className="text-xs text-slate-500">Usually used with port 465.</span>
                </span>
              </label>
              <label className="flex cursor-pointer items-start gap-3">
                <input
                  type="radio"
                  checked={!form.smtpSecure}
                  onChange={() => updateField('smtpSecure', false)}
                  disabled={!canManage || saving}
                  className="mt-1 accent-[#FFC107]"
                />
                <span>
                  <strong className="block text-slate-900">STARTTLS connection</strong>
                  <span className="text-xs text-slate-500">Usually used with port 587.</span>
                </span>
              </label>
            </div>

            <div className="mt-5 flex flex-col gap-3 rounded-xl border border-amber-100 bg-amber-50 p-4 text-sm text-amber-900 sm:flex-row sm:items-center sm:justify-between">
              <span className="flex gap-2">
                <LockKeyhole className="mt-0.5 h-4 w-4 shrink-0" />
                Credentials are encrypted on the server and never returned in plain text.
              </span>
              <button
                type="button"
                disabled={!canManage || saving}
                onClick={() => void saveSettings()}
                className="inline-flex items-center justify-center gap-2 rounded-lg bg-[#FFC107] px-4 py-2.5 font-bold text-black transition hover:bg-[#E5AD06] disabled:cursor-not-allowed disabled:opacity-60"
              >
                <Save className="h-4 w-4" />
                {saving ? 'Saving…' : 'Save settings'}
              </button>
            </div>
          </section>

          <section className="grid gap-6 md:grid-cols-2">
            <div className="rounded-2xl border border-gray-200/80 bg-white p-5 shadow-sm sm:p-6">
              <div className="flex items-start gap-3">
                <div className="rounded-xl bg-sky-50 p-2 text-sky-700">
                  <RefreshCw className="h-5 w-5" />
                </div>
                <div>
                  <h2 className="font-bold text-gray-900">Test SMTP connection</h2>
                  <p className="mt-1 text-xs text-gray-500">Verify the server and credentials without sending an email.</p>
                </div>
              </div>
              <button
                type="button"
                disabled={!canManage || testingConnection || !settings?.credentials.ready}
                onClick={() => void testConnection()}
                className="mt-5 inline-flex w-full items-center justify-center gap-2 rounded-xl border border-gray-900 bg-gray-900 px-4 py-2.5 text-xs font-bold text-white transition hover:bg-black disabled:cursor-not-allowed disabled:opacity-50"
              >
                <RefreshCw className={`h-4 w-4 ${testingConnection ? 'animate-spin' : ''}`} />
                {testingConnection ? 'Checking…' : 'Test connection'}
              </button>
              {settings?.lastTestedAt ? (
                <p className={`mt-3 text-xs font-semibold ${settings.lastTestStatus === 'SUCCESS' ? 'text-emerald-700' : 'text-red-700'}`}>
                  {settings.lastTestStatus === 'SUCCESS' ? 'Last test succeeded.' : settings.lastTestError || 'Last test failed.'}
                </p>
              ) : null}
            </div>

            <div className="rounded-2xl border border-gray-200/80 bg-white p-5 shadow-sm sm:p-6">
              <div className="flex items-start gap-3">
                <div className="rounded-xl bg-[#FFC107]/20 p-2 text-[#9A7100]">
                  <Send className="h-5 w-5" />
                </div>
                <div>
                  <h2 className="font-bold text-gray-900">Send test email</h2>
                  <p className="mt-1 text-xs text-gray-500">Send a safe test message to confirm delivery.</p>
                </div>
              </div>
              <input
                type="email"
                value={testRecipient}
                onChange={(event) => setTestRecipient(event.target.value)}
                disabled={!canManage || sendingTest}
                placeholder="your-email@example.com"
                className="mt-4 h-11 w-full rounded-xl border border-gray-300 px-3.5 text-sm outline-none transition focus:border-[#FFC107] focus:ring-1 focus:ring-[#FFC107] disabled:bg-gray-100"
              />
              <button
                type="button"
                disabled={!canManage || sendingTest || !settings?.credentials.ready || !testRecipient.trim()}
                onClick={() => void sendTestEmail()}
                className="mt-3 inline-flex w-full items-center justify-center gap-2 rounded-xl border border-[#FFC107] bg-[#FFC107] px-4 py-2.5 text-xs font-bold text-black transition hover:bg-[#E5AD06] disabled:cursor-not-allowed disabled:opacity-50"
              >
                <Send className="h-4 w-4" />
                {sendingTest ? 'Sending…' : 'Send test email'}
              </button>
            </div>
          </section>
        </>
      ) : null}

      {/* Tab: Logs */}
      {activeTab === 'LOGS' ? (
        <>
          <section className="rounded-2xl border border-gray-200/80 bg-white p-5 shadow-sm sm:p-6">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 className="font-bold text-gray-900">Recent email delivery</h2>
                <p className="mt-1 text-xs text-gray-500">Queue and SMTP outcomes are recorded without storing the SMTP password.</p>
              </div>
              <button
                type="button"
                onClick={() => void loadLogs()}
                className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-bold text-slate-600 hover:bg-slate-50"
              >
                Refresh
              </button>
            </div>
            <div className="mt-4 overflow-x-auto custom-scrollbar">
              <table className="w-full min-w-[820px] text-left text-xs">
                <thead>
                  <tr className="border-b border-slate-100 text-[10px] uppercase tracking-wider text-slate-400">
                    <th className="px-3 py-3">Event</th>
                    <th className="px-3 py-3">Recipient</th>
                    <th className="px-3 py-3">Subject</th>
                    <th className="px-3 py-3">Status</th>
                    <th className="px-3 py-3">Created</th>
                    <th className="px-3 py-3">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {logs.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="px-3 py-8 text-center text-slate-500">
                        No email delivery records yet.
                      </td>
                    </tr>
                  ) : (
                    logs.map((log) => (
                      <tr key={log.id} className="border-b border-slate-50">
                        <td className="px-3 py-3 font-mono text-[10px] text-slate-600">{log.eventCode}</td>
                        <td className="px-3 py-3 font-semibold text-slate-700">{log.recipientEmail}</td>
                        <td className="max-w-[240px] truncate px-3 py-3 text-slate-600">{log.subject}</td>
                        <td className="px-3 py-3">
                          <span
                            className={`rounded-full px-2 py-1 text-[10px] font-bold ${
                              log.status === 'SENT'
                                ? 'bg-emerald-50 text-emerald-700'
                                : log.status === 'FAILED'
                                ? 'bg-rose-50 text-rose-700'
                                : log.status === 'SKIPPED'
                                ? 'bg-slate-100 text-slate-500'
                                : 'bg-amber-50 text-amber-700'
                            }`}
                          >
                            {log.status}
                          </span>
                          {log.outbox ? (
                            <p className="mt-1 text-[10px] text-slate-500">
                              Outbox: {log.outbox.status} · attempts {log.outbox.attempts}
                            </p>
                          ) : null}
                          {log.errorMessage ? (
                            <p className={`mt-1 max-w-[180px] truncate text-[10px] ${log.status === 'SKIPPED' ? 'text-slate-500' : 'text-rose-600'}`} title={log.errorMessage}>
                              {log.errorMessage}
                            </p>
                          ) : null}
                        </td>
                        <td className="whitespace-nowrap px-3 py-3 text-slate-500">{new Date(log.createdAt).toLocaleString('en-IN')}</td>
                        <td className="px-3 py-3">
                          {/* Every event can be retried. A skipped email was stopped on purpose (for an offer: the link was
                              superseded by a resend or the offer closed), so it has no button; the server also re-checks
                              an offer link before any retry. */}
                          {log.status !== 'SKIPPED' ? (
                            <button
                              type="button"
                              disabled={!canManage || retryingLogId === log.id}
                              onClick={() => void retryLog(log)}
                              className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-2.5 py-1.5 text-[10px] font-bold text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
                            >
                              <RefreshCw className={`h-3 w-3 ${retryingLogId === log.id ? 'animate-spin' : ''}`} />
                              {log.status === 'SENT' ? 'Resend' : 'Retry'}
                            </button>
                          ) : (
                            <span className="text-[10px] text-slate-400">—</span>
                          )}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </section>

          <section className="rounded-2xl border border-gray-200/80 bg-white p-5 shadow-sm sm:p-6">
            <div className="flex items-start gap-3">
              <div className="rounded-xl bg-emerald-50 p-2 text-emerald-700">
                <KeyRound className="h-5 w-5" />
              </div>
              <div>
                <h2 className="font-bold text-gray-900">How delivery works</h2>
                <p className="mt-1 text-xs leading-5 text-gray-500">
                  When an event triggers (such as an offer or status update), the active template is queued. The delivery worker renders candidate data, attaches live PDFs when selected, and retries temporary SMTP failures automatically.
                </p>
              </div>
            </div>
          </section>
        </>
      ) : null}

      {/* Tab: Marketplace Rules */}
      {activeTab === 'MARKETPLACE' ? <EmailTemplateLibrary canManage={canManage} scope="MARKETPLACE" /> : null}

      {/* Tab: Recruitment Rules */}
      {activeTab === 'RECRUITMENT' ? <EmailTemplateLibrary canManage={canManage} scope="RECRUITMENT" /> : null}
    </div>
  );
}
