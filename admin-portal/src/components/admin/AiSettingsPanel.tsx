'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Activity, AlertCircle, Check, CheckCircle2, ChevronDown, Clock3, Database, Eye, EyeOff, KeyRound, Loader2, RefreshCw, Save, ShieldAlert, Sparkles, Trash2 } from 'lucide-react';
import { isAxiosError } from 'axios';
import { toast } from 'react-toastify';
import api from '@/lib/api';
import { notifyAiModelUpdated, subscribeToAiModelUpdates } from '@/lib/aiModelSync';
import { availabilityLabel, formatLatency, type AiToolDataAvailability } from './aiObservabilityModel';
import { useAuthStore } from '@/store/authStore';
import { getProviderModelCatalogMessage } from '@/components/ai/aiModelPicker';

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

type AiModelOption = {
  id: string;
  name: string;
  capabilities: string[];
  transport?: 'chat_completions' | 'responses';
};

type AiModelsResponse = {
  success: boolean;
  provider: AiProvider;
  models: AiModelOption[];
};

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

type AiObservabilitySummary = {
  sampledExecutions: number;
  succeeded: number;
  failed: number;
  denied: number;
  averageMs: number;
  p50Ms: number;
  p95Ms: number;
  maxMs: number;
  slowExecutions: number;
  byTool: Array<{
    toolName: string;
    executions: number;
    succeeded: number;
    failed: number;
    denied: number;
    averageMs: number;
    p95Ms: number;
    maxMs: number;
  }>;
};

type AiObservabilityLog = {
  id: string;
  toolName: string;
  permission: 'ALLOWED' | 'DENIED';
  status: 'SUCCEEDED' | 'FAILED';
  dataAvailability: AiToolDataAvailability;
  durationMs: number;
  errorCode: string | null;
  actorUserId: string;
  actorRole: string;
  createdAt: string;
};

type AiObservabilityResponse = {
  success: boolean;
  summary: AiObservabilitySummary;
  auditLogs: AiObservabilityLog[];
  reliability?: {
    telemetryStatus: 'available' | 'data_unavailable';
    summary: AiReliabilitySummary;
  };
};

type AiLatencySummary = {
  samples: number;
  averageMs: number;
  p50Ms: number;
  p95Ms: number;
  maxMs: number;
};

type AiReliabilitySummary = {
  totalEvents: number;
  queryCount: number;
  toolCount: number;
  surepassCount: number;
  providerCount: number;
  successCount: number;
  failureCount: number;
  permissionDeniedCount: number;
  clarificationCount: number;
  clarificationRate: number;
  emptyDataCount: number;
  emptyDataRate: number;
  providerFailureCount: number;
  queryLatency: AiLatencySummary;
  databaseLatency: AiLatencySummary;
  surepassLatency: AiLatencySummary;
  forecastConfidence: {
    samples: number;
    averageScore: number;
    minScore: number;
    maxScore: number;
  };
};

const emptyObservabilitySummary: AiObservabilitySummary = {
  sampledExecutions: 0,
  succeeded: 0,
  failed: 0,
  denied: 0,
  averageMs: 0,
  p50Ms: 0,
  p95Ms: 0,
  maxMs: 0,
  slowExecutions: 0,
  byTool: [],
};

const emptyReliabilitySummary: AiReliabilitySummary = {
  totalEvents: 0,
  queryCount: 0,
  toolCount: 0,
  surepassCount: 0,
  providerCount: 0,
  successCount: 0,
  failureCount: 0,
  permissionDeniedCount: 0,
  clarificationCount: 0,
  clarificationRate: 0,
  emptyDataCount: 0,
  emptyDataRate: 0,
  providerFailureCount: 0,
  queryLatency: { samples: 0, averageMs: 0, p50Ms: 0, p95Ms: 0, maxMs: 0 },
  databaseLatency: { samples: 0, averageMs: 0, p50Ms: 0, p95Ms: 0, maxMs: 0 },
  surepassLatency: { samples: 0, averageMs: 0, p50Ms: 0, p95Ms: 0, maxMs: 0 },
  forecastConfidence: { samples: 0, averageScore: 0, minScore: 0, maxScore: 0 },
};

const formatRate = (value: number) => `${(Math.max(0, value) * 100).toFixed(1)}%`;

const formatAuditTime = (value: string) => {
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? 'Unknown time' : parsed.toLocaleString();
};

function AiObservabilityPanel() {
  const [days, setDays] = useState(7);
  const [summary, setSummary] = useState<AiObservabilitySummary>(emptyObservabilitySummary);
  const [reliability, setReliability] = useState<AiReliabilitySummary>(emptyReliabilitySummary);
  const [reliabilityStatus, setReliabilityStatus] = useState<'available' | 'data_unavailable'>('data_unavailable');
  const [auditLogs, setAuditLogs] = useState<AiObservabilityLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadObservability = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await api.get<AiObservabilityResponse>('/ai/observability', {
        params: { days, limit: 8 },
      });
      setSummary(response.data.summary || emptyObservabilitySummary);
      setAuditLogs(response.data.auditLogs || []);
      setReliability(response.data.reliability?.summary || emptyReliabilitySummary);
      setReliabilityStatus(response.data.reliability?.telemetryStatus || 'data_unavailable');
    } catch (requestError) {
      setError(errorMessage(requestError, 'AI observability data could not be loaded.'));
    } finally {
      setLoading(false);
    }
  }, [days]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void loadObservability();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [loadObservability]);

  return (
    <section className="rounded-2xl border border-slate-200 bg-slate-50/70 p-5 sm:p-6" aria-labelledby="ai-observability-heading">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Phase 6 reliability &amp; Phase 5 monitoring</p>
          <h3 id="ai-observability-heading" className="mt-1 flex items-center gap-2 text-xl font-bold text-slate-900">
            <Activity className="h-5 w-5 text-emerald-600" />
            AI tool observability
          </h3>
          <p className="mt-1 text-sm text-slate-500">Query, database, provider, permission, empty-data, and forecast signals without exposing prompt or credential contents.</p>
        </div>
        <div className="flex items-center gap-2">
          <label htmlFor="ai-observability-days" className="text-xs font-semibold text-slate-500">Window</label>
          <select
            id="ai-observability-days"
            value={days}
            onChange={(event) => setDays(Number(event.target.value))}
            className="rounded-lg border border-slate-300 bg-white px-2.5 py-2 text-sm font-semibold text-slate-700 outline-none focus:border-yellow-500 focus:ring-2 focus:ring-yellow-100"
          >
            <option value={1}>24 hours</option>
            <option value={7}>7 days</option>
            <option value={30}>30 days</option>
          </select>
          <button type="button" onClick={() => void loadObservability()} disabled={loading} aria-label="Refresh AI observability" className="rounded-lg border border-slate-300 bg-white p-2 text-slate-600 transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-50">
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {error ? (
        <div className="mt-4 flex items-center gap-3 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          <AlertCircle className="h-4 w-4 shrink-0" />
          <span className="flex-1">{error}</span>
          <button type="button" onClick={() => void loadObservability()} className="font-semibold underline">Retry</button>
        </div>
      ) : null}

      <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {[
          { label: 'Executions', value: summary.sampledExecutions, icon: Activity, tone: 'text-slate-900' },
          { label: 'P95 latency', value: formatLatency(summary.p95Ms), icon: Clock3, tone: summary.p95Ms >= 1000 ? 'text-amber-700' : 'text-emerald-700' },
          { label: 'Slow calls', value: summary.slowExecutions, icon: ShieldAlert, tone: summary.slowExecutions ? 'text-amber-700' : 'text-emerald-700' },
          { label: 'Denied calls', value: summary.denied, icon: Database, tone: summary.denied ? 'text-red-700' : 'text-emerald-700' },
        ].map(({ label, value, icon: Icon, tone }) => (
          <div key={label} className="rounded-xl border border-slate-200 bg-white p-4">
            <div className="flex items-center justify-between text-xs font-semibold uppercase tracking-wide text-slate-500">
              {label}
              <Icon className="h-4 w-4 text-slate-400" />
            </div>
            <p className={`mt-2 text-2xl font-bold ${tone}`}>{value}</p>
          </div>
        ))}
      </div>

      {reliabilityStatus === 'data_unavailable' ? (
        <div className="mt-4 flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
          <AlertCircle className="h-4 w-4 shrink-0" />
          Reliability telemetry is currently unavailable; existing tool audit data is still shown below.
        </div>
      ) : null}

      <div className="mt-5 rounded-xl border border-emerald-100 bg-emerald-50/40 p-4">
        <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h4 className="text-sm font-bold text-slate-900">Reliability signals</h4>
            <p className="text-xs text-slate-500">Stored as allow-listed metrics only; operator messages and API keys are never included.</p>
          </div>
          <span className={`text-xs font-semibold ${reliability.totalEvents ? 'text-emerald-700' : 'text-slate-500'}`}>
            {reliability.totalEvents ? `${reliability.totalEvents} events` : 'No telemetry yet'}
          </span>
        </div>
        <div className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {[
            { label: 'Query P95', value: formatLatency(reliability.queryLatency.p95Ms), tone: reliability.queryLatency.p95Ms >= 1000 ? 'text-amber-700' : 'text-emerald-700' },
            { label: 'Database P95', value: formatLatency(reliability.databaseLatency.p95Ms), tone: reliability.databaseLatency.p95Ms >= 1000 ? 'text-amber-700' : 'text-emerald-700' },
            { label: 'Surepass P95', value: formatLatency(reliability.surepassLatency.p95Ms), tone: reliability.surepassLatency.p95Ms >= 1000 ? 'text-amber-700' : 'text-emerald-700' },
            { label: 'Forecast confidence', value: reliability.forecastConfidence.samples ? `${reliability.forecastConfidence.averageScore}%` : '—', tone: 'text-slate-900' },
            { label: 'Permission denied', value: reliability.permissionDeniedCount, tone: reliability.permissionDeniedCount ? 'text-red-700' : 'text-emerald-700' },
            { label: 'Clarification rate', value: formatRate(reliability.clarificationRate), tone: reliability.clarificationRate > 0.25 ? 'text-amber-700' : 'text-slate-900' },
            { label: 'Empty-data rate', value: formatRate(reliability.emptyDataRate), tone: reliability.emptyDataRate > 0.25 ? 'text-amber-700' : 'text-slate-900' },
            { label: 'Provider failures', value: reliability.providerFailureCount, tone: reliability.providerFailureCount ? 'text-red-700' : 'text-emerald-700' },
          ].map(({ label, value, tone }) => (
            <div key={label} className="rounded-lg border border-emerald-100 bg-white p-3">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">{label}</p>
              <p className={`mt-1 text-xl font-bold ${tone}`}>{value}</p>
            </div>
          ))}
        </div>
      </div>

      <div className="mt-5 overflow-hidden rounded-xl border border-slate-200 bg-white">
        <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
          <div>
            <h4 className="text-sm font-bold text-slate-900">Recent tool calls</h4>
            <p className="text-xs text-slate-500">Only safe operational metadata is shown.</p>
          </div>
          <span className="text-xs font-semibold text-slate-500">{summary.succeeded} succeeded · {summary.failed} failed</span>
        </div>
        {loading && !auditLogs.length ? (
          <div className="flex items-center gap-2 px-4 py-8 text-sm text-slate-500"><Loader2 className="h-4 w-4 animate-spin" />Loading monitoring data...</div>
        ) : auditLogs.length ? (
          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-xs">
              <thead className="bg-slate-50 text-[10px] uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-4 py-2.5 font-bold">Tool</th>
                  <th className="px-4 py-2.5 font-bold">Status</th>
                  <th className="px-4 py-2.5 font-bold">Data</th>
                  <th className="px-4 py-2.5 font-bold">Latency</th>
                  <th className="px-4 py-2.5 font-bold">Time</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {auditLogs.map((log) => (
                  <tr key={log.id} className="text-slate-700">
                    <td className="whitespace-nowrap px-4 py-3 font-semibold">{log.toolName}</td>
                    <td className="whitespace-nowrap px-4 py-3"><span className={`rounded-full px-2 py-1 text-[10px] font-bold ${log.permission === 'DENIED' || log.status === 'FAILED' ? 'bg-red-50 text-red-700' : 'bg-emerald-50 text-emerald-700'}`}>{log.permission === 'DENIED' ? 'Denied' : log.status === 'SUCCEEDED' ? 'Succeeded' : 'Failed'}</span></td>
                    <td className="whitespace-nowrap px-4 py-3"><span className={log.dataAvailability === 'UNAVAILABLE' ? 'font-semibold text-amber-700' : 'text-slate-600'}>{availabilityLabel(log.dataAvailability)}</span></td>
                    <td className="whitespace-nowrap px-4 py-3 font-mono">{formatLatency(log.durationMs)}</td>
                    <td className="whitespace-nowrap px-4 py-3 text-slate-500">{formatAuditTime(log.createdAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="flex items-center gap-3 px-4 py-8 text-sm text-slate-500">
            <Database className="h-4 w-4 text-slate-400" />
            No AI tool executions are available for this window.
          </div>
        )}
      </div>
    </section>
  );
}

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

const defaultModelForProvider = (provider: AiProvider) => provider === 'openai' ? 'gpt-4o-mini' : 'claude-haiku-4-5-20251001';

const toForm = (settings: AiSettings): AiForm => ({
  enabled: settings.configuredEnabled,
  provider: settings.provider,
  model: settings.model,
  apiKey: '',
});

export default function AiSettingsPanel() {
  const userRole = useAuthStore((state) => state.user?.role);
  const canViewObservability = userRole === 'SUPER_ADMIN' || userRole === 'ADMIN';
  const [settings, setSettings] = useState<AiSettings>(defaultSettings);
  const [form, setForm] = useState<AiForm>(toForm(defaultSettings));
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [removing, setRemoving] = useState(false);
  const [showKey, setShowKey] = useState(false);
  const [revealedKey, setRevealedKey] = useState<string | null>(null);
  const [revealingKey, setRevealingKey] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [providerOpen, setProviderOpen] = useState(false);
  const [modelOpen, setModelOpen] = useState(false);
  const [modelQuery, setModelQuery] = useState('');
  const [modelOptions, setModelOptions] = useState<AiModelOption[]>([]);
  const [modelsLoading, setModelsLoading] = useState(false);
  const [modelsError, setModelsError] = useState<string | null>(null);
  const providerRef = useRef<HTMLDivElement>(null);
  const modelRef = useRef<HTMLDivElement>(null);

  // Close dropdown on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      const target = e.target as Node;
      if (providerRef.current && !providerRef.current.contains(target)) setProviderOpen(false);
      if (modelRef.current && !modelRef.current.contains(target)) {
        setModelOpen(false);
        setModelQuery('');
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
      setShowKey(false);
      setRevealedKey(null);
    } catch (error) {
      const message = errorMessage(error, 'AI settings could not be loaded.');
      setLoadError(message);
    } finally {
      setLoading(false);
    }
  }, []);

  const loadModels = useCallback(async (provider: AiProvider, draftApiKey = '') => {
    setModelsLoading(true);
    setModelsError(null);
    try {
      const response = await api.post<AiModelsResponse>('/superadmin/ai-settings/models', {
        provider,
        ...(draftApiKey.trim() ? { apiKey: draftApiKey.trim() } : {}),
      });
      const nextModels = response.data.models || [];
      setModelOptions(nextModels);
      setModelsError(getProviderModelCatalogMessage(null, nextModels.length));
      setForm((current) => {
        if (!nextModels.length || nextModels.some((model) => model.id === current.model)) return current;
        return { ...current, model: nextModels[0].id };
      });
    } catch (error) {
      setModelOptions([]);
      setModelsError(errorMessage(error, 'Provider models could not be loaded. Save the provider key, then retry.'));
    } finally {
      setModelsLoading(false);
    }
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void loadSettings();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [loadSettings]);

  useEffect(() => {
    if (loading) return;
    const timer = window.setTimeout(() => {
      void loadModels(form.provider);
    }, 0);
    return () => window.clearTimeout(timer);
  }, [form.provider, loadModels, loading]);

  useEffect(() => subscribeToAiModelUpdates((detail) => {
    if (detail.provider !== form.provider) return;
    setSettings((current) => ({ ...current, model: detail.model }));
    setForm((current) => ({ ...current, model: detail.model }));
  }), [form.provider]);

  const availableModelOptions = modelOptions;

  const selectedModel = useMemo(
    () => availableModelOptions.find((model) => model.id === form.model),
    [availableModelOptions, form.model],
  );

  const filteredModelOptions = useMemo(() => {
    const query = modelQuery.trim().toLowerCase();
    if (!query) return availableModelOptions;
    return availableModelOptions.filter((model) => `${model.name} ${model.id}`.toLowerCase().includes(query));
  }, [availableModelOptions, modelQuery]);

  const selectModel = (model: AiModelOption) => {
    setForm((current) => ({ ...current, model: model.id }));
    setModelOpen(false);
    setModelQuery('');
  };

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
      setRevealedKey(null);
      notifyAiModelUpdated({ provider: nextSettings.provider, model: nextSettings.model });
      toast.success('AI settings saved securely.');
    } catch (error) {
      toast.error(errorMessage(error, 'AI settings could not be saved.'));
    } finally {
      setSaving(false);
    }
  };

  const handleKeyVisibilityToggle = async () => {
    if (showKey) {
      setShowKey(false);
      return;
    }
    if (form.apiKey) {
      setShowKey(true);
      return;
    }
    if (!settings.keyConfigured || revealedKey) {
      setShowKey(Boolean(revealedKey));
      return;
    }

    setRevealingKey(true);
    try {
      const response = await api.get<{ success: boolean; value?: string }>('/superadmin/ai-settings/key/reveal');
      if (!response.data.value) {
        toast.info('AI provider key is not configured.');
        return;
      }
      setRevealedKey(response.data.value);
      setShowKey(true);
    } catch (error) {
      toast.error(errorMessage(error, 'Saved AI provider key could not be revealed.'));
    } finally {
      setRevealingKey(false);
    }
  };

  const hasDraftKey = Boolean(form.apiKey);
  const savedKeyDisplay = settings.keyHint
    ? `••••••••${settings.keyHint.replace(/^\*+/, '')}`
    : '••••••••';

  const handleTest = async () => {
    setTesting(true);
    try {
      await api.post('/superadmin/ai-settings/test', {
        provider: form.provider,
        model: form.model.trim(),
        ...(form.apiKey.trim() ? { apiKey: form.apiKey.trim() } : {}),
      });
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
                      setShowKey(false);
                      setRevealedKey(null);
                      setProviderOpen(false);
                      setModelOpen(false);
                      setModelQuery('');
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
                      setShowKey(false);
                      setRevealedKey(null);
                      setProviderOpen(false);
                      setModelOpen(false);
                      setModelQuery('');
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
                        <div className="text-xs text-gray-500">Claude Haiku 4.5, Claude Sonnet 4.6</div>
                      </div>
                    </div>
                    {form.provider === 'anthropic' && (
                      <Check className="h-4 w-4 text-amber-600" />
                    )}
                  </button>
                </div>
              )}
            </div>
            <div className="block" ref={modelRef}>
              <div className="mb-2 flex items-center justify-between gap-2">
                <span id="ai-model-label" className="block text-sm font-semibold text-gray-700">Model</span>
                <button
                  type="button"
                  onClick={() => void loadModels(form.provider, form.apiKey)}
                  disabled={modelsLoading}
                  className="inline-flex items-center gap-1 text-xs font-semibold text-gray-600 transition hover:text-gray-950 disabled:cursor-not-allowed disabled:opacity-50"
                  title="Refresh models from the provider"
                >
                  <RefreshCw className={`h-3.5 w-3.5 ${modelsLoading ? 'animate-spin' : ''}`} />
                  Refresh
                </button>
              </div>
              <div className="relative">
                <button
                  type="button"
                  id="ai-model-select"
                  aria-haspopup="listbox"
                  aria-expanded={modelOpen}
                  aria-labelledby="ai-model-label"
                  onClick={() => setModelOpen((previous) => !previous)}
                  onKeyDown={(event) => {
                    if (event.key === 'ArrowDown' || event.key === 'Enter' || event.key === ' ') {
                      event.preventDefault();
                      setModelOpen(true);
                    }
                    if (event.key === 'Escape') setModelOpen(false);
                  }}
                  className={`flex w-full items-center justify-between rounded-lg border bg-white px-3 py-2.5 text-left text-sm text-gray-900 transition outline-none ${
                    modelOpen
                      ? 'border-yellow-500 ring-2 ring-yellow-100'
                      : 'border-gray-300 hover:border-gray-400 focus:border-yellow-500 focus:ring-2 focus:ring-yellow-100'
                  }`}
                >
                  <span className="min-w-0 truncate font-medium">
                    {selectedModel ? selectedModel.name : 'Select a provider model'}
                  </span>
                  <ChevronDown className={`ml-3 h-4 w-4 shrink-0 text-gray-400 transition-transform ${modelOpen ? 'rotate-180 text-yellow-600' : ''}`} />
                </button>

                {modelOpen ? (
                  <div
                    role="listbox"
                    aria-label="AI models"
                    className="absolute z-30 mt-1.5 w-full overflow-hidden rounded-xl border border-gray-200 bg-white shadow-xl"
                  >
                    <div className="border-b border-gray-100 p-2">
                      <input
                        type="search"
                        value={modelQuery}
                        onChange={(event) => setModelQuery(event.target.value)}
                        onKeyDown={(event) => {
                          if (event.key === 'Escape') {
                            event.preventDefault();
                            setModelOpen(false);
                            setModelQuery('');
                          }
                          if (event.key === 'Enter' && filteredModelOptions.length === 1) {
                            event.preventDefault();
                            selectModel(filteredModelOptions[0]);
                          }
                        }}
                        placeholder="Search models..."
                        aria-label="Search AI models"
                        autoFocus
                        className="w-full rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-900 outline-none transition placeholder:text-gray-400 focus:border-yellow-500 focus:bg-white focus:ring-2 focus:ring-yellow-100"
                      />
                    </div>
                    <div className="max-h-64 overflow-y-auto p-1.5">
                      {modelsLoading ? (
                        <div className="flex items-center gap-2 px-3 py-3 text-sm text-gray-500">
                          <Loader2 className="h-4 w-4 animate-spin" /> Loading models...
                        </div>
                      ) : filteredModelOptions.length ? (
                        filteredModelOptions.map((model) => (
                          <button
                            key={model.id}
                            type="button"
                            role="option"
                            aria-selected={model.id === form.model}
                            onClick={() => selectModel(model)}
                            className={`flex w-full items-center justify-between gap-3 rounded-lg px-3 py-2.5 text-left text-sm transition-colors ${
                              model.id === form.model
                                ? 'bg-amber-50 text-amber-950'
                                : 'text-gray-700 hover:bg-gray-50'
                            }`}
                          >
                            <span className="min-w-0 truncate">
                              <span className="block truncate font-medium">{model.name}</span>
                              {model.name !== model.id ? <span className="mt-0.5 block truncate text-xs text-gray-500">{model.id}</span> : null}
                            </span>
                            {model.id === form.model ? <Check className="h-4 w-4 shrink-0 text-amber-600" /> : null}
                          </button>
                        ))
                      ) : (
                        <p className="px-3 py-3 text-sm text-gray-500">No matching models found.</p>
                      )}
                    </div>
                  </div>
                ) : null}
              </div>
              {modelsError ? <p className="mt-1.5 text-xs text-amber-700">{modelsError}</p> : null}
              {selectedModel?.capabilities.length ? (
                <div className="mt-2 flex flex-wrap items-center gap-1.5">
                  <span className="text-[11px] font-semibold uppercase tracking-wide text-gray-400">Features</span>
                  {selectedModel.capabilities.map((capability) => (
                    <span key={capability} className="rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[11px] font-semibold capitalize text-emerald-700">{capability}</span>
                  ))}
                </div>
              ) : null}
            </div>
          </div>

          <div className="block">
            <label htmlFor="ai-provider-api-key" className="mb-2 block text-sm font-semibold text-gray-700">Provider API key</label>
            <div className={`relative rounded-lg ${settings.keyConfigured && !hasDraftKey ? 'ring-1 ring-emerald-200' : ''}`}>
              <KeyRound className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-gray-400" />
              <input
                id="ai-provider-api-key"
                type={showKey ? 'text' : 'password'}
                value={form.apiKey || (showKey ? revealedKey || '' : '')}
                onChange={(event) => {
                  const nextValue = event.target.value;
                  setForm((current) => ({ ...current, apiKey: nextValue }));
                  setRevealedKey(null);
                  if (!nextValue) setShowKey(false);
                }}
                onBlur={() => {
                  if (form.apiKey.trim()) void loadModels(form.provider, form.apiKey);
                }}
                placeholder={settings.keyConfigured ? `${savedKeyDisplay} — saved securely; enter only to rotate` : 'Paste a new provider API key'}
                autoComplete="new-password"
                aria-describedby="ai-provider-api-key-help"
                className={`w-full rounded-lg border bg-white py-2.5 pl-10 pr-11 text-sm text-gray-900 outline-none transition focus:border-yellow-500 focus:ring-2 focus:ring-yellow-100 ${settings.keyConfigured && !hasDraftKey ? 'border-emerald-300' : 'border-gray-300'}`}
              />
              <button
                type="button"
                onClick={() => void handleKeyVisibilityToggle()}
                disabled={revealingKey || (!hasDraftKey && !settings.keyConfigured)}
                aria-pressed={showKey}
                aria-label={revealingKey ? 'Loading saved API key' : showKey ? 'Hide API key' : 'Show API key'}
                title={showKey ? 'Hide API key' : 'Show API key'}
                className="absolute right-3 top-2.5 text-gray-500 transition hover:text-gray-900 disabled:cursor-not-allowed disabled:text-gray-300"
              >
                {revealingKey ? <Loader2 className="h-5 w-5 animate-spin" /> : showKey ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
              </button>
            </div>
            <div id="ai-provider-api-key-help" className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs">
              <span className="text-gray-500">Leave blank to retain the saved key. Enter a new key to rotate it.</span>
              {settings.keyConfigured && !hasDraftKey ? <span className="inline-flex items-center gap-1 font-semibold text-emerald-700"><CheckCircle2 className="h-3.5 w-3.5" />Saved securely in database</span> : null}
            </div>
            {settings.keyConfigured && !hasDraftKey ? <p className="mt-1 text-[11px] text-gray-400">The saved key stays masked until you use the eye button. Enter a new key only when rotating it.</p> : null}
            {settings.keyConfigured && !hasDraftKey ? (
              <div className="mt-3 flex items-center justify-between gap-3 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2.5">
                <div className="min-w-0">
                  <p className="text-[11px] font-bold uppercase tracking-wide text-emerald-700">Saved provider key</p>
                  <p className="mt-0.5 truncate font-mono text-sm font-semibold tracking-wider text-emerald-900">{savedKeyDisplay}</p>
                </div>
                <span className="shrink-0 rounded-full border border-emerald-200 bg-white px-2 py-1 text-[10px] font-bold uppercase tracking-wide text-emerald-700">Encrypted</span>
              </div>
            ) : null}
          </div>

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

        {canViewObservability ? <AiObservabilityPanel /> : null}
      </div>
    </section>
  );
}
