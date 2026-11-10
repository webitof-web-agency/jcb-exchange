'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { AlertCircle, Check, CheckCircle2, ChevronDown, Eye, EyeOff, KeyRound, Loader2, RefreshCw, Save, Sparkles, Trash2 } from 'lucide-react';
import { isAxiosError } from 'axios';
import { toast } from 'react-toastify';
import api from '@/lib/api';

type AiProvider = 'openai' | 'anthropic';

type AiSettings = {
  enabled: boolean;
  configuredEnabled: boolean;
  rolloutEnabled: boolean;
  provider: AiProvider;
  model: string;
  keyConfigured: boolean;
  keyHint: string | null;
  encryptionConfigured: boolean;
  source: 'database' | 'environment';
  updatedAt: string | null;
  updatedByUserId: string | null;
};

type AiSettingsResponse = { success: boolean; settings: AiSettings };

type AiForm = {
  enabled: boolean;
  provider: AiProvider;
  model: string;
  apiKey: string;
};

const errorMessage = (error: unknown, fallback: string) => {
  if (isAxiosError<{ error?: string }>(error)) {
    return error.response?.data?.error || fallback;
  }
  return error instanceof Error ? error.message : fallback;
};

const defaultSettings: AiSettings = {
  enabled: false,
  configuredEnabled: false,
  rolloutEnabled: false,
  provider: 'openai',
  model: 'gpt-4o-mini',
  keyConfigured: false,
  keyHint: null,
  encryptionConfigured: false,
  source: 'environment',
  updatedAt: null,
  updatedByUserId: null,
};

const defaultModelForProvider = (provider: AiProvider) => provider === 'openai' ? 'gpt-4o-mini' : 'claude-3-5-haiku-20241022';

const toForm = (settings: AiSettings): AiForm => ({
  enabled: settings.configuredEnabled,
  provider: settings.provider,
  model: settings.model,
  apiKey: '',
});

export default function AiSettingsPanel() {
  const [settings, setSettings] = useState<AiSettings>(defaultSettings);
  const [form, setForm] = useState<AiForm>(toForm(defaultSettings));
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [removing, setRemoving] = useState(false);
  const [showKey, setShowKey] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [providerOpen, setProviderOpen] = useState(false);
  const providerRef = useRef<HTMLDivElement>(null);

  // Close dropdown on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (providerRef.current && !providerRef.current.contains(e.target as Node)) {
        setProviderOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const loadSettings = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const response = await api.get<AiSettingsResponse>('/superadmin/ai-settings');
      const nextSettings = response.data.settings || defaultSettings;
      setSettings(nextSettings);
      setForm(toForm(nextSettings));
    } catch (error) {
      const message = errorMessage(error, 'AI settings could not be loaded.');
      setLoadError(message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void loadSettings();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [loadSettings]);

  const handleSave = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSaving(true);
    try {
      const response = await api.put<AiSettingsResponse>('/superadmin/ai-settings', {
        enabled: form.enabled,
        provider: form.provider,
        model: form.model.trim(),
        ...(form.apiKey.trim() ? { apiKey: form.apiKey.trim() } : {}),
      });
      const nextSettings = response.data.settings;
      setSettings(nextSettings);
      setForm(toForm(nextSettings));
      setShowKey(false);
      toast.success('AI settings saved securely.');
    } catch (error) {
      toast.error(errorMessage(error, 'AI settings could not be saved.'));
    } finally {
      setSaving(false);
    }
  };

  const handleTest = async () => {
    setTesting(true);
    try {
      await api.post('/superadmin/ai-settings/test');
      toast.success('AI provider connection successful.');
    } catch (error) {
      toast.error(errorMessage(error, 'AI provider connection failed.'));
    } finally {
      setTesting(false);
    }
  };

  const handleRemoveKey = async () => {
    if (!window.confirm('Remove the saved AI provider key and disable AI?')) return;
    setRemoving(true);
    try {
      const response = await api.delete<AiSettingsResponse>('/superadmin/ai-settings/key');
      const nextSettings = response.data.settings;
      setSettings(nextSettings);
      setForm(toForm(nextSettings));
      toast.success('AI provider key removed and AI disabled.');
    } catch (error) {
      toast.error(errorMessage(error, 'AI provider key could not be removed.'));
    } finally {
      setRemoving(false);
    }
  };

  if (loading) {
    return (
      <section className="flex min-h-80 items-center justify-center rounded-2xl border border-gray-200 bg-white shadow-sm">
        <Loader2 className="h-7 w-7 animate-spin text-yellow-600" aria-label="Loading AI settings" />
      </section>
    );
  }

  return (
    <section className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm">
      <div className="relative overflow-hidden bg-gray-900 px-6 py-8 sm:px-8">
        <div className="absolute inset-0 bg-gradient-to-r from-gray-900 via-gray-800 to-[#FFC107]/20" />
        <div className="relative flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-yellow-300">Shared AI control plane</p>
            <h2 className="mt-2 flex items-center gap-3 text-3xl font-bold tracking-tight text-white">
              <Sparkles className="h-7 w-7 text-yellow-300" />
              AI Gateway
            </h2>
            <p className="mt-2 max-w-2xl text-sm text-gray-300">
              Configure the shared internal AI provider used by authorized Superadmin, Admin, and Employee workflows.
            </p>
          </div>
          <span className={`inline-flex w-fit items-center gap-2 rounded-lg border px-3 py-1.5 text-sm font-semibold ${settings.enabled
            ? 'border-emerald-300/40 bg-emerald-400/10 text-emerald-300'
            : 'border-amber-300/40 bg-amber-400/10 text-amber-200'
            }`}>
            {settings.enabled ? <CheckCircle2 className="h-4 w-4" /> : <AlertCircle className="h-4 w-4" />}
            {settings.enabled ? 'Enabled' : settings.configuredEnabled && !settings.rolloutEnabled ? 'Rollout disabled' : 'Disabled'}
          </span>
        </div>
      </div>

      {loadError ? (
        <div className="m-6 flex items-start gap-3 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          <div className="flex-1">{loadError}</div>
          <button type="button" onClick={() => void loadSettings()} className="inline-flex items-center gap-1 font-semibold underline">
            <RefreshCw className="h-3.5 w-3.5" /> Retry
          </button>
        </div>
      ) : null}

      <div className="space-y-6 p-6 sm:p-8">

        {!settings.encryptionConfigured ? (
          <div className="flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm leading-6 text-amber-900">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
            <span>Server encryption is not configured. Add a dedicated 64-character hexadecimal <code className="font-mono text-xs">AI_SETTINGS_ENCRYPTION_KEY</code> before saving a provider key.</span>
          </div>
        ) : null}

        {!settings.rolloutEnabled ? (
          <div className="flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm leading-6 text-amber-900">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
            <span>The deployment rollout switch is off. You can save settings safely, but AI requests remain blocked until <code className="font-mono text-xs">AI_ENABLED=true</code> is set on the backend.</span>
          </div>
        ) : null}

        <form onSubmit={handleSave} className="space-y-5">
          <div className="flex items-center justify-between rounded-xl border border-gray-200 bg-gray-50 p-4">
            <div>
              <p className="font-semibold text-gray-900">Enable AI Gateway</p>
              <p className="mt-1 text-sm text-gray-500">Only authenticated internal operators can use the gateway.</p>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={form.enabled}
              aria-label="Toggle AI Gateway"
              onClick={() => setForm((current) => ({ ...current, enabled: !current.enabled }))}
              className={`relative inline-flex h-8 w-14 shrink-0 items-center rounded-full transition-colors ${form.enabled ? 'bg-emerald-500' : 'bg-gray-300'}`}
            >
              <span className={`inline-block h-6 w-6 transform rounded-full bg-white shadow transition-transform ${form.enabled ? 'translate-x-7' : 'translate-x-1'}`} />
            </button>
          </div>

          <div className="grid gap-5 md:grid-cols-2">
            <div className="relative" ref={providerRef}>
              <span id="ai-provider-label" className="mb-2 block text-sm font-semibold text-gray-700">
                Provider
              </span>
              <button
                type="button"
                aria-haspopup="listbox"
                aria-expanded={providerOpen}
                aria-labelledby="ai-provider-label"
                onClick={() => setProviderOpen((prev) => !prev)}
                className={`flex w-full items-center justify-between rounded-lg border bg-white px-3 py-2.5 text-left text-sm text-gray-900 transition outline-none ${
                  providerOpen
                    ? 'border-yellow-500 ring-2 ring-yellow-100'
                    : 'border-gray-300 hover:border-gray-400 focus:border-yellow-500 focus:ring-2 focus:ring-yellow-100'
                }`}
              >
                <div className="flex items-center gap-2.5 min-w-0">
                  {form.provider === 'openai' ? (
                    <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded bg-emerald-50 text-emerald-700 border border-emerald-200">
                      <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="currentColor">
                        <path d="M22.2819 9.8211a5.9847 5.9847 0 0 0-.5157-4.9108 6.0462 6.0462 0 0 0-6.5098-2.9A6.0651 6.0651 0 0 0 4.9807 4.1818a5.9847 5.9847 0 0 0-3.9977 2.9 6.0462 6.0462 0 0 0 .7427 7.0966 5.98 5.98 0 0 0 .511 4.9107 6.051 6.051 0 0 0 6.5146 2.9001A5.9847 5.9847 0 0 0 13.2594 24a6.0557 6.0557 0 0 0 5.7718-4.2058 5.9894 5.9894 0 0 0 3.9977-2.9001 6.0557 6.0557 0 0 0-.747-7.0729zm-9.022 12.6081a4.4755 4.4755 0 0 1-2.8764-1.0408l.1419-.0804 4.7783-2.7582a.7948.7948 0 0 0 .3927-.6813v-6.7369l2.02 1.1686a.071.071 0 0 1 .038.052v5.5826a4.504 4.504 0 0 1-4.4945 4.4944zm-9.6607-4.1254a4.4708 4.4708 0 0 1-.5346-3.0137l.142.0852 4.783 2.7582a.7712.7712 0 0 0 .7806 0l5.8428-3.3685v2.3324a.0804.0804 0 0 1-.0332.0615L9.74 19.9502a4.4992 4.4992 0 0 1-6.1408-1.6464zM2.3408 7.8956a4.485 4.485 0 0 1 2.3655-1.9728V11.6a.7664.7664 0 0 0 .3879.6765l5.8144 3.3543-2.0201 1.1685a.0757.0757 0 0 1-.071 0l-4.8303-2.7865A4.504 4.504 0 0 1 2.3408 7.872zm16.5963 3.8558L13.1038 8.364 15.1192 7.2a.0757.0757 0 0 1 .071 0l4.8303 2.7913a4.4944 4.4944 0 0 1-.6765 8.1042v-5.6772a.79.79 0 0 0-.407-.667zm2.0107-3.0231l-.142-.0852-4.7735-2.7818a.7759.7759 0 0 0-.7854 0L9.409 9.2297V6.8974a.0662.0662 0 0 1 .0284-.0615l4.8303-2.7866a4.4992 4.4992 0 0 1 6.6802 4.66zM8.3065 12.863l-2.02-1.1638a.0804.0804 0 0 1-.038-.0567V6.0742a4.4992 4.4992 0 0 1 7.3757-3.4537l-.142.0805L8.704 5.459a.7948.7948 0 0 0-.3927.6813zm1.0976-2.3654l2.602-1.4998 2.6069 1.4998v2.9994l-2.5974 1.4997-2.6067-1.4997Z"/>
                      </svg>
                    </span>
                  ) : (
                    <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded bg-amber-50 text-amber-800 border border-amber-200">
                      <Sparkles className="h-3.5 w-3.5 text-amber-600" />
                    </span>
                  )}
                  <span className="font-medium text-gray-900">
                    {form.provider === 'openai' ? 'OpenAI' : 'Anthropic'}
                  </span>
                </div>
                <ChevronDown
                  className={`h-4 w-4 text-gray-400 transition-transform duration-200 ${
                    providerOpen ? 'rotate-180 text-yellow-600' : ''
                  }`}
                />
              </button>

              {providerOpen && (
                <div
                  role="listbox"
                  className="absolute z-20 mt-1.5 w-full rounded-xl border border-gray-200 bg-white p-1.5 shadow-lg animate-in fade-in zoom-in-95 duration-100"
                >
                  <button
                    type="button"
                    role="option"
                    aria-selected={form.provider === 'openai'}
                    onClick={() => {
                      setForm((current) => ({
                        ...current,
                        provider: 'openai',
                        model: defaultModelForProvider('openai'),
                      }));
                      setProviderOpen(false);
                    }}
                    className={`flex w-full items-center justify-between rounded-lg px-3 py-2.5 text-left text-sm transition-colors ${
                      form.provider === 'openai'
                        ? 'bg-amber-50/80 text-amber-950 font-semibold'
                        : 'text-gray-700 hover:bg-gray-50'
                    }`}
                  >
                    <div className="flex items-center gap-2.5">
                      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-emerald-50 text-emerald-700 border border-emerald-200">
                        <svg className="h-4 w-4" viewBox="0 0 24 24" fill="currentColor">
                          <path d="M22.2819 9.8211a5.9847 5.9847 0 0 0-.5157-4.9108 6.0462 6.0462 0 0 0-6.5098-2.9A6.0651 6.0651 0 0 0 4.9807 4.1818a5.9847 5.9847 0 0 0-3.9977 2.9 6.0462 6.0462 0 0 0 .7427 7.0966 5.98 5.98 0 0 0 .511 4.9107 6.051 6.051 0 0 0 6.5146 2.9001A5.9847 5.9847 0 0 0 13.2594 24a6.0557 6.0557 0 0 0 5.7718-4.2058 5.9894 5.9894 0 0 0 3.9977-2.9001 6.0557 6.0557 0 0 0-.747-7.0729zm-9.022 12.6081a4.4755 4.4755 0 0 1-2.8764-1.0408l.1419-.0804 4.7783-2.7582a.7948.7948 0 0 0 .3927-.6813v-6.7369l2.02 1.1686a.071.071 0 0 1 .038.052v5.5826a4.504 4.504 0 0 1-4.4945 4.4944zm-9.6607-4.1254a4.4708 4.4708 0 0 1-.5346-3.0137l.142.0852 4.783 2.7582a.7712.7712 0 0 0 .7806 0l5.8428-3.3685v2.3324a.0804.0804 0 0 1-.0332.0615L9.74 19.9502a4.4992 4.4992 0 0 1-6.1408-1.6464zM2.3408 7.8956a4.485 4.485 0 0 1 2.3655-1.9728V11.6a.7664.7664 0 0 0 .3879.6765l5.8144 3.3543-2.0201 1.1685a.0757.0757 0 0 1-.071 0l-4.8303-2.7865A4.504 4.504 0 0 1 2.3408 7.872zm16.5963 3.8558L13.1038 8.364 15.1192 7.2a.0757.0757 0 0 1 .071 0l4.8303 2.7913a4.4944 4.4944 0 0 1-.6765 8.1042v-5.6772a.79.79 0 0 0-.407-.667zm2.0107-3.0231l-.142-.0852-4.7735-2.7818a.7759.7759 0 0 0-.7854 0L9.409 9.2297V6.8974a.0662.0662 0 0 1 .0284-.0615l4.8303-2.7866a4.4992 4.4992 0 0 1 6.6802 4.66zM8.3065 12.863l-2.02-1.1638a.0804.0804 0 0 1-.038-.0567V6.0742a4.4992 4.4992 0 0 1 7.3757-3.4537l-.142.0805L8.704 5.459a.7948.7948 0 0 0-.3927.6813zm1.0976-2.3654l2.602-1.4998 2.6069 1.4998v2.9994l-2.5974 1.4997-2.6067-1.4997Z"/>
                        </svg>
                      </span>
                      <div>
                        <div className="font-semibold text-gray-900">OpenAI</div>
                        <div className="text-xs text-gray-500">gpt-4o-mini, gpt-4o</div>
                      </div>
                    </div>
                    {form.provider === 'openai' && (
                      <Check className="h-4 w-4 text-amber-600" />
                    )}
                  </button>

                  <button
                    type="button"
                    role="option"
                    aria-selected={form.provider === 'anthropic'}
                    onClick={() => {
                      setForm((current) => ({
                        ...current,
                        provider: 'anthropic',
                        model: defaultModelForProvider('anthropic'),
                      }));
                      setProviderOpen(false);
                    }}
                    className={`mt-1 flex w-full items-center justify-between rounded-lg px-3 py-2.5 text-left text-sm transition-colors ${
                      form.provider === 'anthropic'
                        ? 'bg-amber-50/80 text-amber-950 font-semibold'
                        : 'text-gray-700 hover:bg-gray-50'
                    }`}
                  >
                    <div className="flex items-center gap-2.5">
                      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-amber-50 text-amber-800 border border-amber-200">
                        <Sparkles className="h-4 w-4 text-amber-600" />
                      </span>
                      <div>
                        <div className="font-semibold text-gray-900">Anthropic</div>
                        <div className="text-xs text-gray-500">claude-3-5-haiku, claude-3-5-sonnet</div>
                      </div>
                    </div>
                    {form.provider === 'anthropic' && (
                      <Check className="h-4 w-4 text-amber-600" />
                    )}
                  </button>
                </div>
              )}
            </div>
            <label className="block">
              <span className="mb-2 block text-sm font-semibold text-gray-700">Model</span>
              <input
                value={form.model}
                onChange={(event) => setForm((current) => ({ ...current, model: event.target.value }))}
                placeholder={form.provider === 'openai' ? 'gpt-4o-mini' : 'claude-3-5-haiku-20241022'}
                maxLength={100}
                required
                className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2.5 text-sm text-gray-900 outline-none transition focus:border-yellow-500 focus:ring-2 focus:ring-yellow-100"
              />
            </label>
          </div>

          <label className="block">
            <span className="mb-2 block text-sm font-semibold text-gray-700">Provider API key</span>
            <div className="relative">
              <KeyRound className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-gray-400" />
              <input
                type={showKey ? 'text' : 'password'}
                value={form.apiKey}
                onChange={(event) => setForm((current) => ({ ...current, apiKey: event.target.value }))}
                placeholder={settings.keyConfigured ? `Saved securely (${settings.keyHint || '****'}) — enter only to rotate` : 'Paste a new provider API key'}
                autoComplete="new-password"
                className="w-full rounded-lg border border-gray-300 bg-white py-2.5 pl-10 pr-11 text-sm text-gray-900 outline-none transition focus:border-yellow-500 focus:ring-2 focus:ring-yellow-100"
              />
              <button type="button" onClick={() => setShowKey((current) => !current)} aria-label={showKey ? 'Hide API key' : 'Show API key'} className="absolute right-3 top-2.5 text-gray-500 hover:text-gray-900">
                {showKey ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
              </button>
            </div>
            <span className="mt-1.5 block text-xs text-gray-500">Leave blank to retain the saved key. Enter a new key to rotate it.</span>
          </label>

          <div className="grid gap-3 sm:grid-cols-3">
            <div className="rounded-xl border border-gray-200 bg-gray-50 p-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Key status</p>
              <p className={`mt-1 font-semibold ${settings.keyConfigured ? 'text-emerald-700' : 'text-gray-700'}`}>{settings.keyConfigured ? 'Configured' : 'Not configured'}</p>
            </div>
            <div className="rounded-xl border border-gray-200 bg-gray-50 p-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Storage source</p>
              <p className="mt-1 font-semibold capitalize text-gray-900">{settings.source}</p>
            </div>
            <div className="rounded-xl border border-gray-200 bg-gray-50 p-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Encryption</p>
              <p className={`mt-1 font-semibold ${settings.encryptionConfigured ? 'text-emerald-700' : 'text-amber-700'}`}>{settings.encryptionConfigured ? 'Ready' : 'Server action required'}</p>
            </div>
          </div>

          <div className="flex flex-col gap-3 border-t border-gray-100 pt-5 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex flex-wrap gap-3">
              <button type="submit" disabled={saving || removing} className="inline-flex items-center justify-center gap-2 rounded-lg bg-[#FFC107] px-5 py-2.5 text-sm font-semibold text-black transition hover:bg-[#E5AD06] disabled:cursor-not-allowed disabled:opacity-60">
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                {saving ? 'Saving...' : 'Save AI settings'}
              </button>
              <button type="button" disabled={testing || saving || !settings.keyConfigured} onClick={() => void handleTest()} className="inline-flex items-center justify-center gap-2 rounded-lg border border-blue-200 bg-blue-50 px-5 py-2.5 text-sm font-semibold text-blue-700 transition hover:bg-blue-100 disabled:cursor-not-allowed disabled:opacity-60">
                {testing ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                {testing ? 'Testing...' : 'Test connection'}
              </button>
            </div>
            <button type="button" disabled={removing || saving || !settings.keyConfigured} onClick={() => void handleRemoveKey()} className="inline-flex items-center justify-center gap-2 rounded-lg border border-red-200 px-5 py-2.5 text-sm font-semibold text-red-700 transition hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-60">
              {removing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
              {removing ? 'Removing...' : 'Remove key & disable'}
            </button>
          </div>
        </form>
      </div>
    </section>
  );
}
