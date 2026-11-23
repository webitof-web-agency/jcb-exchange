'use client';

/* eslint-disable react-hooks/set-state-in-effect, react-hooks/exhaustive-deps */

import { useEffect, useState } from 'react';
import axios from 'axios';
import { AlertCircle, CheckCircle2, Code2, Eye, EyeOff, FileText, KeyRound, LockKeyhole, Mail, Paperclip, RefreshCw, Save, Send, Server, ShieldCheck } from 'lucide-react';
import api from '@/lib/api';
import { useAuthStore } from '@/store/authStore';
import { hasPermission } from '@/lib/permissionUtils';

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

type EmailTemplate = {
  id: string;
  name: string;
  type: string;
  subject: string;
  body: string;
  variables: string[];
  enabled: boolean;
  attachmentMode: 'NONE' | 'DYNAMIC_OFFER_PDF';
  isDefault: boolean;
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
};

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
      className={`relative inline-flex h-7 w-12 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-[#FFC107] focus:ring-offset-2 ${checked ? 'bg-emerald-500' : 'bg-gray-300'} disabled:cursor-not-allowed disabled:opacity-60`}
    >
      <span className={`pointer-events-none inline-block h-6 w-6 transform rounded-full bg-white shadow-md transition duration-200 ${checked ? 'translate-x-5' : 'translate-x-0'}`} />
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
  const [templates, setTemplates] = useState<EmailTemplate[]>([]);
  const [selectedTemplateId, setSelectedTemplateId] = useState('');
  const [templateSubject, setTemplateSubject] = useState('');
  const [templateBody, setTemplateBody] = useState('');
  const [templateEnabled, setTemplateEnabled] = useState(true);
  const [templateAttachmentMode, setTemplateAttachmentMode] = useState<'NONE' | 'DYNAMIC_OFFER_PDF'>('NONE');
  const [savingTemplate, setSavingTemplate] = useState(false);
  const [logs, setLogs] = useState<EmailLog[]>([]);

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

  const loadTemplates = async () => {
    try {
      const response = await api.get<{ data?: { emailTemplates?: EmailTemplate[] }; templates?: EmailTemplate[] }>('/recruitment/admin/settings', { params: { section: 'templates' } });
      const nextTemplates = response.data.data?.emailTemplates || response.data.templates || [];
      setTemplates(nextTemplates);
      setSelectedTemplateId((current) => current || nextTemplates[0]?.id || '');
      const selected = nextTemplates.find((template) => template.id === (selectedTemplateId || nextTemplates[0]?.id));
      if (selected) {
        setTemplateSubject(selected.subject);
        setTemplateBody(selected.body);
        setTemplateEnabled(selected.enabled);
        setTemplateAttachmentMode(selected.attachmentMode);
      }
    } catch (requestError) {
      setError(errorText(requestError, 'Unable to load email templates.'));
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
      void loadTemplates();
      void loadLogs();
    }
  }, [canRead]);

  const selectTemplate = (template: EmailTemplate) => {
    setSelectedTemplateId(template.id);
    setTemplateSubject(template.subject);
    setTemplateBody(template.body);
    setTemplateEnabled(template.enabled);
    setTemplateAttachmentMode(template.attachmentMode);
  };

  const saveTemplate = async () => {
    if (!canManage || !selectedTemplateId) return;
    setSavingTemplate(true);
    setError('');
    setNotice('');
    try {
      await api.put(`/recruitment/admin/settings/templates/${selectedTemplateId}`, {
        subject: templateSubject,
        bodyHtml: templateBody,
        enabled: templateEnabled,
        attachmentMode: templateAttachmentMode,
      });
      setTemplates((current) => current.map((template) => template.id === selectedTemplateId
        ? { ...template, subject: templateSubject, body: templateBody, enabled: templateEnabled, attachmentMode: templateAttachmentMode }
        : template));
      setNotice('Email template saved successfully.');
    } catch (requestError) {
      setError(errorText(requestError, 'Unable to save email template.'));
    } finally {
      setSavingTemplate(false);
    }
  };

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

  if (!canRead) {
    return <div className="mx-auto max-w-5xl p-6 text-sm font-semibold text-gray-600">You do not have permission to view Email Communications.</div>;
  }

  return (
    <div className="mx-auto max-w-7xl space-y-6 px-3 py-2 sm:px-6 sm:py-4 lg:px-8">
      <section className="grid grid-cols-1 gap-3.5 sm:grid-cols-3 sm:gap-4 lg:gap-5">
        <div className="rounded-2xl border border-gray-200/80 bg-white p-4 shadow-sm sm:p-5">
          <div className="flex items-center justify-between"><p className="text-xs font-bold uppercase tracking-wider text-gray-500">Email Status</p><div className={`rounded-xl p-2 ${settings?.ready && settings.enabled ? 'bg-emerald-50 text-emerald-600' : 'bg-gray-100 text-gray-400'}`}><Mail className="h-5 w-5" /></div></div>
          <p className="mt-2 text-2xl font-black tracking-tight text-gray-900">{loading ? '…' : settings?.ready && settings.enabled ? 'Active' : 'Off'}</p>
          <p className="mt-1 text-xs text-gray-500">Transactional email delivery</p>
        </div>
        <div className="rounded-2xl border border-gray-200/80 bg-white p-4 shadow-sm sm:p-5">
          <div className="flex items-center justify-between"><p className="text-xs font-bold uppercase tracking-wider text-gray-500">SMTP Provider</p><div className="rounded-xl bg-amber-50 p-2 text-[#d99d00]"><Server className="h-5 w-5" /></div></div>
          <p className="mt-2 truncate text-lg font-black tracking-tight text-gray-900">{settings?.smtpHost || 'Not configured'}</p>
          <p className="mt-1 text-xs text-gray-500">{settings?.smtpPort ? `Port ${settings.smtpPort}` : 'Add SMTP credentials below'}</p>
        </div>
        <div className="rounded-2xl border border-gray-200/80 bg-white p-4 shadow-sm sm:p-5">
          <div className="flex items-center justify-between"><p className="text-xs font-bold uppercase tracking-wider text-gray-500">Security</p><div className="rounded-xl bg-sky-50 p-2 text-sky-700"><ShieldCheck className="h-5 w-5" /></div></div>
          <p className="mt-2 text-lg font-black tracking-tight text-gray-900">{settings?.credentials.encryptionKeyConfigured ? 'Encrypted' : 'Needs setup'}</p>
          <p className="mt-1 text-xs text-gray-500">SMTP password stays masked</p>
        </div>
      </section>

      {error ? <div role="alert" className="flex items-start gap-3 rounded-2xl border border-red-200 bg-red-50/90 p-4 text-sm font-semibold text-red-800 shadow-sm"><AlertCircle className="h-5 w-5 shrink-0 text-red-600" /><span>{error}</span></div> : null}
      {notice ? <div role="status" className="flex items-start gap-3 rounded-2xl border border-emerald-200 bg-emerald-50/90 p-4 text-sm font-semibold text-emerald-800 shadow-sm"><CheckCircle2 className="h-5 w-5 shrink-0 text-emerald-600" /><span>{notice}</span></div> : null}

      <section className="rounded-2xl border border-gray-200/80 bg-white p-4 shadow-sm sm:p-6 lg:p-7">
        <div className="flex flex-col gap-4 border-b border-gray-100 pb-5 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-3"><div className="shrink-0 rounded-xl bg-amber-50 p-2.5 text-[#d99d00]"><Mail className="h-6 w-6" /></div><div><h1 className="text-lg font-bold text-gray-900 sm:text-xl">Transactional Email Settings</h1><p className="mt-1 text-xs text-gray-500 sm:text-sm">Configure SMTP once for offer letters, recruitment updates and future email automations.</p></div></div>
          <div className="flex shrink-0 items-center gap-3 self-start rounded-xl border border-gray-200 bg-gray-50/80 px-3.5 py-2 text-sm font-bold sm:self-center"><span className={form.enabled ? 'text-emerald-700' : 'text-gray-500'}>{form.enabled ? 'Enabled' : 'Disabled'}</span><Toggle checked={form.enabled} disabled={!canManage || saving} onChange={(value) => updateField('enabled', value)} /></div>
        </div>

        <div className="mt-6 grid gap-5 sm:grid-cols-2">
          <label className="block text-xs font-bold uppercase tracking-wider text-gray-700">SMTP host<input value={form.smtpHost} onChange={(event) => updateField('smtpHost', event.target.value)} disabled={!canManage || saving} placeholder="smtp.gmail.com" className="mt-1.5 h-11 w-full rounded-xl border border-gray-300 bg-white px-3.5 text-sm font-medium normal-case outline-none transition focus:border-[#FFC107] focus:ring-1 focus:ring-[#FFC107] disabled:bg-gray-100" /></label>
          <label className="block text-xs font-bold uppercase tracking-wider text-gray-700">SMTP port<input value={form.smtpPort} onChange={(event) => updateField('smtpPort', event.target.value.replace(/\D/g, ''))} disabled={!canManage || saving} inputMode="numeric" placeholder="465" className="mt-1.5 h-11 w-full rounded-xl border border-gray-300 bg-white px-3.5 text-sm font-medium normal-case outline-none transition focus:border-[#FFC107] focus:ring-1 focus:ring-[#FFC107] disabled:bg-gray-100" /></label>
          <label className="block text-xs font-bold uppercase tracking-wider text-gray-700">Sender email<input type="email" value={form.senderEmail} onChange={(event) => updateField('senderEmail', event.target.value)} disabled={!canManage || saving} placeholder="hr@yourcompany.com" className="mt-1.5 h-11 w-full rounded-xl border border-gray-300 bg-white px-3.5 text-sm font-medium normal-case outline-none transition focus:border-[#FFC107] focus:ring-1 focus:ring-[#FFC107] disabled:bg-gray-100" /></label>
          <label className="block text-xs font-bold uppercase tracking-wider text-gray-700">Sender name<input value={form.senderName} onChange={(event) => updateField('senderName', event.target.value)} disabled={!canManage || saving} placeholder="JCB Exchange HR" className="mt-1.5 h-11 w-full rounded-xl border border-gray-300 bg-white px-3.5 text-sm font-medium normal-case outline-none transition focus:border-[#FFC107] focus:ring-1 focus:ring-[#FFC107] disabled:bg-gray-100" /></label>
          <label className="block text-xs font-bold uppercase tracking-wider text-gray-700">Reply-to email <span className="normal-case font-normal text-gray-500">(optional)</span><input type="email" value={form.replyToEmail} onChange={(event) => updateField('replyToEmail', event.target.value)} disabled={!canManage || saving} placeholder="replies@yourcompany.com" className="mt-1.5 h-11 w-full rounded-xl border border-gray-300 bg-white px-3.5 text-sm font-medium normal-case outline-none transition focus:border-[#FFC107] focus:ring-1 focus:ring-[#FFC107] disabled:bg-gray-100" /></label>
          <div><div className="flex items-center justify-between gap-3"><label className="block text-xs font-bold uppercase tracking-wider text-gray-700">SMTP password / app password</label>{settings?.credentials.passwordConfigured ? <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-1 text-[10px] font-bold uppercase tracking-wide text-emerald-700"><CheckCircle2 className="h-3 w-3" /> Saved securely</span> : null}</div><div className="relative mt-1.5"><input type={showPassword ? 'text' : 'password'} value={form.smtpPassword} onChange={(event) => updateField('smtpPassword', event.target.value)} autoComplete="new-password" disabled={!canManage || saving} placeholder={settings?.credentials.passwordConfigured ? 'Enter only to replace saved password' : 'Enter SMTP password or app password'} className="h-11 w-full rounded-xl border border-gray-300 bg-white px-3.5 pr-10 text-sm outline-none transition focus:border-[#FFC107] focus:ring-1 focus:ring-[#FFC107] disabled:bg-gray-100" /><button type="button" onClick={() => setShowPassword((value) => !value)} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600" aria-label={showPassword ? 'Hide SMTP password' : 'Show SMTP password'}>{showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}</button></div></div>
        </div>

        <div className="mt-5 grid gap-4 rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-700 md:grid-cols-2"><label className="flex cursor-pointer items-start gap-3"><input type="radio" checked={form.smtpSecure} onChange={() => updateField('smtpSecure', true)} disabled={!canManage || saving} className="mt-1 accent-[#FFC107]" /><span><strong className="block text-slate-900">SSL / secure connection</strong><span className="text-xs text-slate-500">Usually used with port 465.</span></span></label><label className="flex cursor-pointer items-start gap-3"><input type="radio" checked={!form.smtpSecure} onChange={() => updateField('smtpSecure', false)} disabled={!canManage || saving} className="mt-1 accent-[#FFC107]" /><span><strong className="block text-slate-900">STARTTLS connection</strong><span className="text-xs text-slate-500">Usually used with port 587.</span></span></label></div>

        <div className="mt-5 flex flex-col gap-3 rounded-xl border border-amber-100 bg-amber-50 p-4 text-sm text-amber-900 sm:flex-row sm:items-center sm:justify-between"><span className="flex gap-2"><LockKeyhole className="mt-0.5 h-4 w-4 shrink-0" />Credentials are encrypted on the server and never returned in plain text.</span><button type="button" disabled={!canManage || saving} onClick={() => void saveSettings()} className="inline-flex items-center justify-center gap-2 rounded-lg bg-[#FFC107] px-4 py-2.5 font-bold text-black transition hover:bg-[#E5AD06] disabled:cursor-not-allowed disabled:opacity-60"><Save className="h-4 w-4" />{saving ? 'Saving…' : 'Save settings'}</button></div>
      </section>

      <section className="grid gap-6 md:grid-cols-2">
        <div className="rounded-2xl border border-gray-200/80 bg-white p-5 shadow-sm sm:p-6"><div className="flex items-start gap-3"><div className="rounded-xl bg-sky-50 p-2 text-sky-700"><RefreshCw className="h-5 w-5" /></div><div><h2 className="font-bold text-gray-900">Test SMTP connection</h2><p className="mt-1 text-xs text-gray-500">Verify the server and credentials without sending an email.</p></div></div><button type="button" disabled={!canManage || testingConnection || !settings?.credentials.ready} onClick={() => void testConnection()} className="mt-5 inline-flex w-full items-center justify-center gap-2 rounded-xl border border-gray-900 bg-gray-900 px-4 py-2.5 text-xs font-bold text-white transition hover:bg-black disabled:cursor-not-allowed disabled:opacity-50"><RefreshCw className={`h-4 w-4 ${testingConnection ? 'animate-spin' : ''}`} />{testingConnection ? 'Checking…' : 'Test connection'}</button>{settings?.lastTestedAt ? <p className={`mt-3 text-xs font-semibold ${settings.lastTestStatus === 'SUCCESS' ? 'text-emerald-700' : 'text-red-700'}`}>{settings.lastTestStatus === 'SUCCESS' ? 'Last test succeeded.' : settings.lastTestError || 'Last test failed.'}</p> : null}</div>
        <div className="rounded-2xl border border-gray-200/80 bg-white p-5 shadow-sm sm:p-6"><div className="flex items-start gap-3"><div className="rounded-xl bg-[#FFC107]/20 p-2 text-[#9A7100]"><Send className="h-5 w-5" /></div><div><h2 className="font-bold text-gray-900">Send test email</h2><p className="mt-1 text-xs text-gray-500">Send a safe test message to confirm delivery.</p></div></div><input type="email" value={testRecipient} onChange={(event) => setTestRecipient(event.target.value)} disabled={!canManage || sendingTest} placeholder="your-email@example.com" className="mt-4 h-11 w-full rounded-xl border border-gray-300 px-3.5 text-sm outline-none transition focus:border-[#FFC107] focus:ring-1 focus:ring-[#FFC107] disabled:bg-gray-100" /><button type="button" disabled={!canManage || sendingTest || !settings?.credentials.ready || !testRecipient.trim()} onClick={() => void sendTestEmail()} className="mt-3 inline-flex w-full items-center justify-center gap-2 rounded-xl border border-[#FFC107] bg-[#FFC107] px-4 py-2.5 text-xs font-bold text-black transition hover:bg-[#E5AD06] disabled:cursor-not-allowed disabled:opacity-50"><Send className="h-4 w-4" />{sendingTest ? 'Sending…' : 'Send test email'}</button></div>
      </section>

      <section className="rounded-2xl border border-gray-200/80 bg-white p-5 shadow-sm sm:p-6">
        <div className="flex items-start justify-between gap-4"><div><h2 className="font-bold text-gray-900">Recent email delivery</h2><p className="mt-1 text-xs text-gray-500">Queue and SMTP outcomes are recorded without storing the SMTP password.</p></div><button type="button" onClick={() => void loadLogs()} className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-bold text-slate-600 hover:bg-slate-50">Refresh</button></div>
        <div className="mt-4 overflow-x-auto"><table className="w-full min-w-[680px] text-left text-xs"><thead><tr className="border-b border-slate-100 text-[10px] uppercase tracking-wider text-slate-400"><th className="px-3 py-3">Event</th><th className="px-3 py-3">Recipient</th><th className="px-3 py-3">Subject</th><th className="px-3 py-3">Status</th><th className="px-3 py-3">Created</th></tr></thead><tbody>{logs.length === 0 ? <tr><td colSpan={5} className="px-3 py-8 text-center text-slate-500">No email delivery records yet.</td></tr> : logs.map((log) => <tr key={log.id} className="border-b border-slate-50"><td className="px-3 py-3 font-mono text-[10px] text-slate-600">{log.eventCode}</td><td className="px-3 py-3 font-semibold text-slate-700">{log.recipientEmail}</td><td className="max-w-[240px] truncate px-3 py-3 text-slate-600">{log.subject}</td><td className="px-3 py-3"><span className={`rounded-full px-2 py-1 text-[10px] font-bold ${log.status === 'SENT' ? 'bg-emerald-50 text-emerald-700' : log.status === 'FAILED' ? 'bg-rose-50 text-rose-700' : log.status === 'SKIPPED' ? 'bg-slate-100 text-slate-500' : 'bg-amber-50 text-amber-700'}`}>{log.status}</span>{log.errorMessage ? <p className="mt-1 max-w-[180px] truncate text-[10px] text-rose-600" title={log.errorMessage}>{log.errorMessage}</p> : null}</td><td className="whitespace-nowrap px-3 py-3 text-slate-500">{new Date(log.createdAt).toLocaleString('en-IN')}</td></tr>)}</tbody></table></div>
      </section>

      <section className="rounded-2xl border border-gray-200/80 bg-white p-5 shadow-sm sm:p-6 lg:p-7">
        <div className="flex flex-col gap-3 border-b border-gray-100 pb-5 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-3"><div className="rounded-xl bg-violet-50 p-2.5 text-violet-700"><FileText className="h-5 w-5" /></div><div><h2 className="text-lg font-bold text-gray-900">Email templates &amp; delivery rules</h2><p className="mt-1 text-xs text-gray-500">Each event has its own toggle. Attachments are resolved from the live business record when the email is delivered.</p></div></div>
          <span className="inline-flex items-center gap-1.5 rounded-full bg-slate-100 px-3 py-1.5 text-[10px] font-bold uppercase tracking-wide text-slate-600"><Code2 className="h-3.5 w-3.5" /> Variable based</span>
        </div>
        <div className="mt-6 grid gap-5 lg:grid-cols-[240px_1fr]">
          <div className="space-y-2">
            {templates.length === 0 ? <p className="rounded-xl bg-slate-50 p-4 text-xs text-slate-500">No templates found.</p> : templates.map((template) => (
              <button key={template.id} type="button" onClick={() => selectTemplate(template)} className={`w-full rounded-xl border p-3 text-left transition ${selectedTemplateId === template.id ? 'border-amber-300 bg-amber-50 text-amber-950 shadow-sm' : 'border-slate-200 bg-slate-50 text-slate-700 hover:bg-slate-100'}`}>
                <span className="flex items-center justify-between gap-2"><span className="text-xs font-extrabold">{template.name}</span><span className={`h-2 w-2 rounded-full ${template.enabled ? 'bg-emerald-500' : 'bg-slate-300'}`} /></span>
                <span className="mt-1 block font-mono text-[10px] text-slate-400">{template.type}</span>
              </button>
            ))}
          </div>
          <div className="min-w-0 space-y-5">
            {selectedTemplateId ? <>
              <div className="flex flex-col gap-3 rounded-xl border border-slate-200 bg-slate-50 p-4 sm:flex-row sm:items-center sm:justify-between"><div><p className="text-xs font-extrabold text-slate-900">Automation status</p><p className="mt-1 text-xs text-slate-500">Off means this event will never enqueue an email.</p></div><div className="flex items-center gap-3"><span className={`text-xs font-bold ${templateEnabled ? 'text-emerald-700' : 'text-slate-500'}`}>{templateEnabled ? 'Enabled' : 'Disabled'}</span><Toggle checked={templateEnabled} disabled={!canManage || savingTemplate} onChange={setTemplateEnabled} /></div></div>
              <label className="block text-xs font-bold uppercase tracking-wider text-gray-700">Subject<input value={templateSubject} onChange={(event) => setTemplateSubject(event.target.value)} disabled={!canManage || savingTemplate} className="mt-1.5 h-11 w-full rounded-xl border border-gray-300 bg-white px-3.5 text-sm font-medium normal-case outline-none focus:border-[#FFC107] focus:ring-1 focus:ring-[#FFC107] disabled:bg-gray-100" /></label>
              <label className="block text-xs font-bold uppercase tracking-wider text-gray-700">HTML body<textarea rows={9} value={templateBody} onChange={(event) => setTemplateBody(event.target.value)} disabled={!canManage || savingTemplate} className="mt-1.5 w-full rounded-xl border border-gray-300 bg-white p-3.5 font-mono text-xs leading-5 normal-case outline-none focus:border-[#FFC107] focus:ring-1 focus:ring-[#FFC107] disabled:bg-gray-100" /></label>
              <div className="rounded-xl border border-slate-200 bg-white p-4"><p className="flex items-center gap-2 text-xs font-extrabold text-slate-900"><Paperclip className="h-4 w-4 text-amber-600" />Attachment rule</p><label className="mt-3 flex cursor-pointer items-start gap-3"><input type="radio" checked={templateAttachmentMode === 'NONE'} onChange={() => setTemplateAttachmentMode('NONE')} disabled={!canManage || savingTemplate} className="mt-1 accent-[#FFC107]" /><span><strong className="block text-xs text-slate-900">Text/HTML only</strong><span className="text-xs text-slate-500">No PDF is attached.</span></span></label><label className="mt-3 flex cursor-pointer items-start gap-3"><input type="radio" checked={templateAttachmentMode === 'DYNAMIC_OFFER_PDF'} onChange={() => setTemplateAttachmentMode('DYNAMIC_OFFER_PDF')} disabled={!canManage || savingTemplate} className="mt-1 accent-[#FFC107]" /><span><strong className="block text-xs text-slate-900">Attach live offer letter PDF</strong><span className="text-xs text-slate-500">The latest PDF stored for that offer is attached at delivery time. A sample/dummy PDF is never sent.</span></span></label></div>
              <div className="flex flex-col gap-3 rounded-xl border border-amber-100 bg-amber-50 p-4 sm:flex-row sm:items-center sm:justify-between"><p className="text-xs leading-5 text-amber-900">Variables are resolved per candidate and offer. The offer event also adds a secure accept/decline link.</p><button type="button" onClick={() => void saveTemplate()} disabled={!canManage || savingTemplate} className="inline-flex shrink-0 items-center justify-center gap-2 rounded-lg bg-[#FFC107] px-4 py-2.5 text-xs font-bold text-black hover:bg-[#E5AD06] disabled:cursor-not-allowed disabled:opacity-60"><Save className="h-4 w-4" />{savingTemplate ? 'Saving...' : 'Save template'}</button></div>
            </> : <p className="rounded-xl bg-slate-50 p-6 text-sm text-slate-500">Select a template to configure its message and attachment policy.</p>}
          </div>
        </div>
      </section>

      <section className="rounded-2xl border border-gray-200/80 bg-white p-5 shadow-sm sm:p-6"><div className="flex items-start gap-3"><div className="rounded-xl bg-emerald-50 p-2 text-emerald-700"><KeyRound className="h-5 w-5" /></div><div><h2 className="font-bold text-gray-900">How delivery works</h2><p className="mt-1 text-xs leading-5 text-gray-500">When an offer is created or resent, the enabled template is queued. The worker renders current candidate data, attaches the current offer PDF when selected, and retries temporary SMTP failures without blocking the recruitment workflow.</p></div></div></section>
    </div>
  );
}
