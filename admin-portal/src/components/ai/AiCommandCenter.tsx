'use client';

import Link from 'next/link';
import { isAxiosError } from 'axios';
import {
  AlertCircle,
  CheckCircle2,
  ChevronDown,
  Clipboard,
  Copy,
  Loader2,
  MessageSquareText,
  RefreshCw,
  Send,
  Settings2,
  ShieldCheck,
  Sparkles,
  TerminalSquare,
  Wrench,
  X,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import { toast } from 'react-toastify';
import api from '@/lib/api';
import { purifyAiHtml } from '@/lib/safeHtml';
import { useAuthStore } from '@/store/authStore';
import { notifyAiConversationUpdated, subscribeToAiConversationUpdates } from './aiConversationSync';
import {
  getAiRuntimePresentation,
  getAiToolArguments,
  normalizeAiMessage,
  type AiReadOnlyTool,
  type AiRuntimeStatus,
} from './aiCommandCenterModel';
import AiActionReviewQueue from './AiActionReviewQueue';

type AiStatusResponse = AiRuntimeStatus & { success: boolean };

type AiChatResponse = {
  success: boolean;
  conversationId?: string;
  requestId: string;
  provider: string;
  model: string;
  answer: string;
  tool?: { name: string; label: string };
};

type AiConversationMessage = {
  role: 'USER' | 'ASSISTANT';
  content: string;
  requestId?: string | null;
  provider?: string | null;
  modelAlias?: string | null;
};

type AiToolsResponse = {
  success: boolean;
  tools: AiReadOnlyTool[];
};

type AiBriefingResponse = {
  success: boolean;
  timezone: string;
  date: string;
  briefing: {
    status: 'GENERATING' | 'READY' | 'FAILED' | 'STALE';
    content: string | null;
    generatedAt: string | null;
    expiresAt: string | null;
    updatedAt: string;
    nextAttemptAt: string | null;
  } | null;
};

type AiErrorResponse = { error?: string; code?: string };

const QUICK_PROMPTS = [
  'Summarize the most important operational risks I should review today.',
  'What should an internal operator verify before approving a partner?',
  'Give me a concise checklist for reviewing pending KYC work.',
];

const errorMessage = (error: unknown, fallback: string) => {
  if (isAxiosError<AiErrorResponse>(error)) {
    return error.response?.data?.error || fallback;
  }
  return error instanceof Error ? error.message : fallback;
};

const defaultStatus: AiRuntimeStatus = {
  enabled: false,
  provider: 'openai',
  modelConfigured: false,
  keyConfigured: false,
};

const statusToneClasses = {
  success: 'border-emerald-200 bg-emerald-50 text-emerald-700',
  warning: 'border-amber-200 bg-amber-50 text-amber-800',
  neutral: 'border-slate-200 bg-slate-50 text-slate-700',
} as const;

export default function AiCommandCenter() {
  const { user } = useAuthStore();
  const [status, setStatus] = useState<AiRuntimeStatus>(defaultStatus);
  const [statusLoading, setStatusLoading] = useState(true);
  const [statusError, setStatusError] = useState<string | null>(null);
  const [message, setMessage] = useState('');
  const [answer, setAnswer] = useState<AiChatResponse | null>(null);
  const [chatLoading, setChatLoading] = useState(false);
  const [chatError, setChatError] = useState<string | null>(null);
  const [tools, setTools] = useState<AiReadOnlyTool[]>([]);
  const [toolsError, setToolsError] = useState<string | null>(null);
  const [selectedToolName, setSelectedToolName] = useState<string | null>(null);
  const [toolQuery, setToolQuery] = useState('');
  const [briefing, setBriefing] = useState<AiBriefingResponse | null>(null);
  const [briefingLoading, setBriefingLoading] = useState(true);
  const [briefingError, setBriefingError] = useState<string | null>(null);
  const [activeConversationId, setActiveConversationId] = useState<string | null>(null);
  const [isBriefingOpen, setIsBriefingOpen] = useState(false);
  const [isResponseOpen, setIsResponseOpen] = useState(true);
  const [isInspectorExpanded, setIsInspectorExpanded] = useState(false);
  const [sidebarTab, setSidebarTab] = useState<'tools' | 'prompts' | 'status'>('tools');

  const isSuperadmin = user?.role === 'SUPER_ADMIN';
  const presentation = useMemo(() => getAiRuntimePresentation(status), [status]);
  const normalizedMessage = normalizeAiMessage(message);
  const selectedTool = tools.find((tool) => tool.name === selectedToolName) || null;
  const canSubmit = Boolean(status.enabled && normalizedMessage && (!selectedTool || selectedTool.name !== 'listing.search' || toolQuery.trim()) && !chatLoading);

  const loadStatus = useCallback(async () => {
    setStatusLoading(true);
    setStatusError(null);
    try {
      const response = await api.get<AiStatusResponse>('/ai/status');
      setStatus({
        enabled: Boolean(response.data.enabled),
        provider: response.data.provider || 'configured provider',
        modelConfigured: Boolean(response.data.modelConfigured),
        keyConfigured: Boolean(response.data.keyConfigured),
        configurationError: response.data.configurationError || null,
      });
    } catch (error) {
      setStatusError(errorMessage(error, 'AI runtime status could not be loaded.'));
    } finally {
      setStatusLoading(false);
    }
  }, []);

  const loadTools = useCallback(async () => {
    setToolsError(null);
    try {
      const response = await api.get<AiToolsResponse>('/ai/tools');
      setTools(response.data.tools.filter((tool) => tool.available));
    } catch (error) {
      setToolsError(errorMessage(error, 'Read-only AI tools could not be loaded.'));
    }
  }, []);

  const loadBriefing = useCallback(async () => {
    setBriefingLoading(true);
    setBriefingError(null);
    try {
      const response = await api.get<AiBriefingResponse>('/ai/briefing');
      setBriefing(response.data);
    } catch (error) {
      setBriefingError(errorMessage(error, 'Daily briefing could not be loaded.'));
    } finally {
      setBriefingLoading(false);
    }
  }, []);

  const loadLatestConversation = useCallback(async (requestedConversationId?: string) => {
    try {
      const historyResponse = await api.get<{ success: boolean; conversations: Array<{ id: string; status: 'ACTIVE' | 'ARCHIVED' }> }>('/ai/history');
      const conversation = (requestedConversationId
        ? historyResponse.data.conversations.find((item) => item.id === requestedConversationId && item.status === 'ACTIVE')
        : null)
        || historyResponse.data.conversations.find((item) => item.status === 'ACTIVE')
        || null;
      if (!conversation) {
        setActiveConversationId(null);
        setAnswer(null);
        return;
      }
      const messagesResponse = await api.get<{ success: boolean; messages: AiConversationMessage[] }>(`/ai/history/${conversation.id}/messages`);
      const latestAssistant = [...messagesResponse.data.messages].reverse().find((item) => item.role === 'ASSISTANT');
      setActiveConversationId(conversation.id);
      if (latestAssistant) {
        setAnswer({
          success: true,
          conversationId: conversation.id,
          requestId: latestAssistant.requestId || 'saved-history',
          provider: latestAssistant.provider || 'saved history',
          model: latestAssistant.modelAlias || 'saved history',
          answer: latestAssistant.content,
        });
      } else {
        setAnswer(null);
      }
    } catch {
      // History is an enhancement to the operational prompt; provider status and prompt remain usable.
    }
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void loadStatus();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [loadStatus]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void loadTools();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [loadTools]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void loadBriefing();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [loadBriefing]);

  useEffect(() => subscribeToAiConversationUpdates(({ conversationId }) => {
    void loadLatestConversation(conversationId);
  }), [loadLatestConversation]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void loadLatestConversation();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [loadLatestConversation]);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const nextMessage = normalizeAiMessage(message);
    if (!nextMessage || !status.enabled) return;

    setChatLoading(true);
    setChatError(null);
    try {
      const request: { message: string; conversationId?: string; tool?: { name: string; arguments: Record<string, unknown> } } = { message: nextMessage };
      if (activeConversationId) request.conversationId = activeConversationId;
      if (selectedTool) {
        request.tool = {
          name: selectedTool.name,
          arguments: getAiToolArguments(selectedTool, toolQuery),
        };
      }
      const response = await api.post<AiChatResponse>('/ai/chat', request);
      setAnswer(response.data);
      if (response.data.conversationId) {
        setActiveConversationId(response.data.conversationId);
        notifyAiConversationUpdated({ conversationId: response.data.conversationId });
      }
      setMessage('');
    } catch (error) {
      const nextError = errorMessage(error, 'The AI request could not be completed.');
      setChatError(nextError);
      toast.error(nextError);
    } finally {
      setChatLoading(false);
    }
  };

  const handleCopy = async () => {
    if (!answer?.answer) return;
    try {
      await navigator.clipboard.writeText(answer.answer);
      toast.success('AI response copied.');
    } catch {
      toast.error('Response could not be copied.');
    }
  };

  return (
    <main className="min-h-full bg-slate-100/70 px-4 py-4 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-7xl space-y-3.5">
        
        {/* 1. SLICK COMPACT COCKPIT BANNER */}
        <section className="relative overflow-hidden rounded-xl border border-slate-800 bg-gradient-to-r from-[#070F1E] via-[#0B1A33] to-[#12284C] p-3.5 sm:p-4 text-white shadow-sm flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-[#FFC107]/40 bg-[#FFC107]/15 text-[#FFC107]">
              <Sparkles className="h-5 w-5" aria-hidden="true" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <h1 className="text-sm sm:text-base font-extrabold text-white tracking-tight truncate">
                  JCB Intelligence Hub
                </h1>
                <span className="shrink-0 rounded border border-[#FFC107]/30 bg-[#FFC107]/20 px-1.5 py-0.5 text-[9.5px] font-bold text-[#FFC107] uppercase">
                  Internal Ops (Read-Only)
                </span>
              </div>
              <p className="text-[11px] sm:text-xs text-slate-300 truncate">
                Read-only operational assistant & inventory lookup. Does not modify or approve data.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0 self-end sm:self-auto">
            <span className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-xs font-semibold ${statusToneClasses[presentation.tone]}`}>
              <span className={`h-1.5 w-1.5 rounded-full ${status.enabled ? 'bg-emerald-500 animate-pulse' : 'bg-amber-500'}`} />
              {status.enabled ? `${status.provider} · Active` : presentation.label}
            </span>
            {isSuperadmin && (
              <Link
                href="/admin/settings"
                title="Manage AI Settings"
                className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-white/10 text-slate-300 hover:bg-white/20 hover:text-white transition"
              >
                <Settings2 className="h-4 w-4" aria-hidden="true" />
              </Link>
            )}
          </div>
        </section>

        {statusError ? (
          <div className="flex flex-col gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-2.5 text-xs sm:text-sm text-red-800 sm:flex-row sm:items-center sm:justify-between" role="alert">
            <span className="flex items-start gap-2">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
              {statusError}
            </span>
            <button
              type="button"
              onClick={() => void loadStatus()}
              className="inline-flex h-8 items-center justify-center gap-1.5 rounded-lg border border-red-200 bg-white px-3 text-xs font-semibold text-red-700 hover:bg-red-50"
            >
              <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" /> Retry
            </button>
          </div>
        ) : null}

        {/* 2. COLLAPSIBLE DAILY BRIEFING (Slim 42px Bar) */}
        <section className="overflow-hidden rounded-xl border border-slate-200/90 bg-white shadow-2xs transition-all" aria-live="polite">
          <div className="flex items-center justify-between px-4 py-2.5 bg-slate-50/80 border-b border-slate-100">
            <button
              type="button"
              onClick={() => setIsBriefingOpen((prev) => !prev)}
              className="flex flex-1 items-center justify-between text-left pr-3 cursor-pointer group"
              aria-expanded={isBriefingOpen}
            >
              <div className="flex items-center gap-2.5">
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-amber-50 text-amber-800 border border-amber-200">
                  <Clipboard className="h-4 w-4 text-[#D69E00]" aria-hidden="true" />
                </span>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold text-slate-900 group-hover:text-amber-800 transition-colors">
                      Daily AI Briefing
                    </span>
                    <span className="text-[11px] text-slate-500 hidden sm:inline">
                      Asia/Kolkata · {briefing?.date ?? 'Today'}
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-500 hidden md:block">Cached operations signal per operator & date.</p>
                </div>
              </div>
              <div className="flex items-center gap-2.5">
                <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-slate-100 text-slate-600 border border-slate-200">
                  {briefing?.briefing?.status === 'READY' ? 'Ready · Saved' : 'Scheduled / Cache'}
                </span>
                <ChevronDown
                  className={`h-4 w-4 text-slate-400 transition-transform duration-200 ${
                    isBriefingOpen ? 'rotate-180 text-amber-600' : ''
                  }`}
                  aria-hidden="true"
                />
              </div>
            </button>

            <button
              type="button"
              onClick={() => void loadBriefing()}
              disabled={briefingLoading}
              title="Refresh cache"
              className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 hover:text-slate-900 transition disabled:opacity-50"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${briefingLoading ? 'animate-spin motion-reduce:animate-none' : ''}`} aria-hidden="true" />
            </button>
          </div>

          {isBriefingOpen && (
            <div className="p-4 sm:p-5 border-t border-slate-100 animate-in fade-in duration-150">
              {briefingError ? <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-900" role="alert">{briefingError}</div> : null}
              {!briefingError && briefingLoading ? <div className="flex min-h-16 items-center justify-center text-xs text-slate-500"><Loader2 className="h-4 w-4 animate-spin mr-2" /> Loading saved briefing…</div> : null}
              {!briefingError && !briefingLoading && !briefing?.briefing ? (
                <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-4 text-xs text-slate-600 text-center">
                  No briefing has been generated for {briefing?.date ?? 'today'} yet. The background worker will create it after the daily briefing window.
                </div>
              ) : null}
              {!briefingError && !briefingLoading && briefing?.briefing?.status === 'READY' ? (
                <div className="rounded-xl border border-emerald-200 bg-emerald-50/50 p-4">
                  <div className="mb-2.5 flex flex-wrap items-center justify-between gap-2 border-b border-emerald-200/60 pb-2">
                    <span className="inline-flex items-center rounded-full border border-emerald-200 bg-white px-2 py-0.5 text-[10px] font-bold text-emerald-700">Ready · {briefing.date}</span>
                    <span className="text-[11px] text-slate-500">Generated {briefing.briefing.generatedAt ? new Date(briefing.briefing.generatedAt).toLocaleString() : '—'}</span>
                  </div>
                  <p className="whitespace-pre-wrap text-xs sm:text-sm leading-relaxed text-slate-800">{briefing.briefing.content || 'The briefing is empty.'}</p>
                </div>
              ) : null}
              {!briefingError && !briefingLoading && briefing?.briefing && briefing.briefing.status !== 'READY' ? (
                <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs leading-5 text-amber-900">
                  Briefing status: <span className="font-bold">{briefing.briefing.status.toLowerCase()}</span>. The worker will retry through its scheduled job.
                </div>
              ) : null}
            </div>
          )}
        </section>

        {/* 3. COLLAPSIBLE ACTION REVIEW QUEUE */}
        <AiActionReviewQueue />

        {/* 4. MAIN TWO-COLUMN WORKSPACE */}
        <section className="grid gap-3.5 lg:grid-cols-12 items-start">
          
          {/* Left Column: Interactive Chat & Response Flow */}
          <div className="lg:col-span-8 space-y-3.5 min-w-0">
            
            {/* Prompt Card */}
            <div className="overflow-hidden rounded-xl border border-slate-200/90 bg-white p-4 shadow-2xs">
              
              {/* Quick suggestion chips directly above input */}
              <div className="flex items-center gap-1.5 overflow-x-auto pb-2.5 mb-2.5 border-b border-slate-100">
                <span className="text-[10px] font-bold text-slate-400 uppercase shrink-0">Quick Ask:</span>
                {QUICK_PROMPTS.map((quickPrompt, idx) => (
                  <button
                    key={idx}
                    type="button"
                    disabled={!status.enabled || chatLoading}
                    onClick={() => setMessage(quickPrompt)}
                    className="shrink-0 px-2.5 py-1 rounded-md text-[11px] font-medium bg-slate-50 hover:bg-amber-50 text-slate-700 hover:text-amber-900 border border-slate-200 transition disabled:opacity-50"
                  >
                    ⚡ {quickPrompt.length > 38 ? quickPrompt.slice(0, 38) + '…' : quickPrompt}
                  </button>
                ))}
              </div>

              {/* Selected Tool Pill Banner */}
              {selectedTool && (
                <div className="mb-2.5 flex items-center justify-between rounded-lg bg-amber-50/80 border border-amber-200/80 px-3 py-1.5 text-xs">
                  <div className="flex items-center gap-2">
                    <ShieldCheck className="h-4 w-4 text-amber-700 shrink-0" />
                    <span className="font-bold text-amber-950">Active Tool: {selectedTool.label}</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => { setSelectedToolName(null); setToolQuery(''); }}
                    className="text-[11px] font-semibold text-amber-900 underline hover:text-black"
                  >
                    Clear Tool
                  </button>
                </div>
              )}

              {/* Tool search query input if listing.search selected */}
              {selectedTool?.name === 'listing.search' && (
                <div className="mb-2.5">
                  <label htmlFor="ai-tool-query" className="block text-xs font-semibold text-slate-700 mb-1">
                    Listing Search Term
                  </label>
                  <input
                    id="ai-tool-query"
                    value={toolQuery}
                    onChange={(event) => setToolQuery(event.target.value.slice(0, 100))}
                    maxLength={100}
                    placeholder="e.g. JCB 3DX Raipur"
                    className="h-9 w-full rounded-lg border border-slate-300 px-3 text-xs text-slate-900 outline-none focus:border-[#C28B00] focus:ring-2 focus:ring-[#FFC107]/20"
                    disabled={!status.enabled || chatLoading}
                  />
                </div>
              )}

              {/* Prompt Input Form */}
              <form onSubmit={handleSubmit} className="space-y-3">
                <textarea
                  id="ai-command-prompt"
                  value={message}
                  onChange={(event) => setMessage(event.target.value.slice(0, 4_000))}
                  maxLength={4_000}
                  rows={3}
                  placeholder="Ask internal operational guidance (e.g. Summarize pending partner reviews and tell me what to check first)..."
                  className="w-full resize-none rounded-xl border border-slate-200 bg-slate-50/50 p-3 text-xs sm:text-sm leading-relaxed text-slate-900 placeholder:text-slate-400 outline-none transition focus:bg-white focus:border-[#C28B00] focus:ring-2 focus:ring-[#FFC107]/20 disabled:bg-slate-100"
                  disabled={!status.enabled || chatLoading}
                />

                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 text-[11px] text-slate-400">
                    <span>{message.length.toLocaleString()} / 4,000 chars</span>
                    {status.enabled && (
                      <span className="text-emerald-600 font-semibold flex items-center gap-1">
                        <CheckCircle2 className="h-3 w-3" />
                        Ready
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    {message ? (
                      <button
                        type="button"
                        onClick={() => setMessage('')}
                        disabled={chatLoading}
                        className="inline-flex h-8 items-center gap-1 rounded-lg px-2.5 text-xs font-semibold text-slate-600 hover:bg-slate-100 transition disabled:opacity-50"
                      >
                        <X className="h-3.5 w-3.5" /> Clear
                      </button>
                    ) : null}
                    <button
                      type="submit"
                      disabled={!canSubmit}
                      className="inline-flex h-9 items-center justify-center gap-1.5 rounded-lg bg-[#FFC107] px-4 text-xs font-bold text-slate-950 shadow-xs transition hover:bg-[#E9AD00] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#C28B00] disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-500"
                    >
                      {chatLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
                      {chatLoading ? 'Thinking…' : 'Ask AI'}
                    </button>
                  </div>
                </div>

                {!statusLoading && !status.enabled && (
                  <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900" role="status">
                    <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                    <span>
                      {presentation.description}
                      {isSuperadmin ? <> Open <Link className="font-bold underline" href="/admin/settings">AI Settings</Link> to configure it.</> : null}
                    </span>
                  </div>
                )}
              </form>
            </div>

            {/* Chat Error alert */}
            {chatError && (
              <div className="flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-2.5 text-xs text-red-800" role="alert">
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                <span>{chatError}</span>
              </div>
            )}

            {/* Inline Assistant Response Box */}
            <div className="overflow-hidden rounded-xl border border-slate-200/90 bg-white shadow-2xs" aria-live="polite">
              <div className="min-h-10 bg-slate-50/80 px-4 flex items-center justify-between gap-2 border-b border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsResponseOpen((previous) => !previous)}
                  className="flex min-w-0 flex-1 items-center gap-2 py-2 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#C28B00]"
                  aria-expanded={isResponseOpen}
                  aria-controls="verified-ai-response-content"
                >
                  <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded bg-slate-900 text-[#FFC107]">
                    <Sparkles className="h-3 w-3" aria-hidden="true" />
                  </span>
                  <span className="truncate text-xs font-bold text-slate-800">Verified AI Response</span>
                  <ChevronDown className={`ml-auto h-4 w-4 shrink-0 text-slate-400 transition-transform ${isResponseOpen ? 'rotate-180' : ''}`} aria-hidden="true" />
                </button>
                {answer && (
                  <button
                    type="button"
                    onClick={() => void handleCopy()}
                    className="inline-flex items-center gap-1 text-[11px] font-semibold text-slate-500 hover:text-slate-900 transition"
                  >
                    <Copy className="h-3.5 w-3.5" /> Copy
                  </button>
                )}
              </div>
              {isResponseOpen && <div id="verified-ai-response-content" className="max-h-[520px] overflow-y-auto overscroll-contain p-4 custom-scrollbar sm:p-5 lg:max-h-[calc(100vh-360px)]">
                {answer ? (
                  <>
                    <div
                      className="prose prose-sm max-w-none text-xs sm:text-sm leading-relaxed text-slate-800"
                      dangerouslySetInnerHTML={{ __html: purifyAiHtml(answer.answer) }}
                    />
                    <div className="mt-4 flex flex-wrap gap-x-4 gap-y-1 border-t border-slate-100 pt-3 text-[10px] text-slate-400">
                      <span>Request ID: {answer.requestId}</span>
                      <span>Provider: {answer.provider}</span>
                      <span>Model: {answer.model}</span>
                      {answer.tool ? <span>Tool: {answer.tool.label}</span> : null}
                    </div>
                  </>
                ) : (
                  <div className="flex min-h-20 flex-col items-center justify-center text-center py-2">
                    <MessageSquareText className="h-6 w-6 text-slate-300" aria-hidden="true" />
                    <p className="mt-2 text-xs font-semibold text-slate-700">No request yet</p>
                    <p className="text-[11px] text-slate-400 max-w-sm">
                      Your verified internal AI response will appear here after submitting a prompt.
                    </p>
                  </div>
                )}
              </div>}
            </div>

          </div>

          {/* Right Column: Tabbed Inspector Widget */}
          <aside className="lg:col-span-4 bg-white rounded-xl border border-slate-200/90 shadow-2xs overflow-hidden">
            <div className="flex items-center justify-between border-b border-slate-100 bg-white px-3.5 py-2">
              <span className="text-[10px] font-bold uppercase tracking-[0.14em] text-slate-500">AI Inspector</span>
              <button
                type="button"
                onClick={() => setIsInspectorExpanded((previous) => !previous)}
                className="inline-flex h-7 w-7 items-center justify-center rounded-lg text-slate-500 transition hover:bg-slate-100 hover:text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#C28B00]"
                aria-expanded={isInspectorExpanded}
                aria-controls="ai-inspector-content"
                aria-label={isInspectorExpanded ? 'Collapse AI Inspector' : 'Expand AI Inspector'}
                title={isInspectorExpanded ? 'Collapse inspector' : 'Expand inspector'}
              >
                <ChevronDown className={`h-4 w-4 transition-transform ${isInspectorExpanded ? 'rotate-180' : ''}`} aria-hidden="true" />
              </button>
            </div>
            <div id="ai-inspector-content" className={`overflow-y-auto overscroll-contain custom-scrollbar transition-[max-height] duration-200 ${isInspectorExpanded ? 'max-h-[calc(100vh-230px)]' : 'max-h-[430px]'}`}>
            
            {/* Tab Header Navigation */}
            <div className="flex border-b border-slate-100 bg-slate-50 text-[11px] font-bold text-slate-500">
              <button
                type="button"
                onClick={() => setSidebarTab('tools')}
                className={`flex-1 py-2.5 text-center transition border-b-2 ${
                  sidebarTab === 'tools'
                    ? 'text-slate-900 border-[#FFC107] bg-white font-bold'
                    : 'border-transparent hover:text-slate-800'
                }`}
              >
                Tools ({tools.length})
              </button>
              <button
                type="button"
                onClick={() => setSidebarTab('prompts')}
                className={`flex-1 py-2.5 text-center transition border-b-2 ${
                  sidebarTab === 'prompts'
                    ? 'text-slate-900 border-[#FFC107] bg-white font-bold'
                    : 'border-transparent hover:text-slate-800'
                }`}
              >
                Prompts
              </button>
              <button
                type="button"
                onClick={() => setSidebarTab('status')}
                className={`flex-1 py-2.5 text-center transition border-b-2 ${
                  sidebarTab === 'status'
                    ? 'text-slate-900 border-[#FFC107] bg-white font-bold'
                    : 'border-transparent hover:text-slate-800'
                }`}
              >
                Status
              </button>
            </div>

            {/* Tab 1: Read-Only Data Tools */}
            {sidebarTab === 'tools' && (
              <div className="p-3.5 space-y-2.5 animate-in fade-in duration-100">
                <div className="flex items-center justify-between text-[11px]">
                  <span className="font-semibold text-slate-600">Scoped Data Tools</span>
                  {selectedTool && (
                    <button
                      type="button"
                      onClick={() => { setSelectedToolName(null); setToolQuery(''); }}
                      className="text-amber-800 underline font-bold hover:text-black"
                    >
                      Clear
                    </button>
                  )}
                </div>
                {toolsError ? <p className="text-[11px] text-amber-900 bg-amber-50 p-2 rounded">{toolsError}</p> : null}
                <div className="space-y-2">
                  {tools.map((tool) => (
                    <button
                      key={tool.name}
                      type="button"
                      disabled={!status.enabled || chatLoading}
                      onClick={() => {
                        setSelectedToolName(tool.name);
                        if (tool.name === 'listing.search' && !message) {
                          setMessage('Summarize the matching listings and their current availability.');
                        }
                      }}
                      className={`w-full rounded-lg border p-2.5 text-left transition ${
                        selectedToolName === tool.name
                          ? 'border-[#C28B00] bg-[#FFF9E6] ring-1 ring-[#FFC107]'
                          : 'border-slate-200 hover:border-slate-300 hover:bg-slate-50'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-bold text-slate-800">{tool.label}</span>
                        <span className="text-[9px] font-bold px-1.5 py-0.2 rounded bg-slate-100 text-slate-600">Read-Only</span>
                      </div>
                      <p className="mt-0.5 text-[11px] leading-4 text-slate-500">{tool.description}</p>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Tab 2: Quick Prompts */}
            {sidebarTab === 'prompts' && (
              <div className="p-3.5 space-y-2 animate-in fade-in duration-100">
                <div className="text-[11px] font-semibold text-slate-600">Pre-built Safe Prompts</div>
                <div className="space-y-1.5">
                  {QUICK_PROMPTS.map((quickPrompt, idx) => (
                    <button
                      key={idx}
                      type="button"
                      disabled={!status.enabled || chatLoading}
                      onClick={() => setMessage(quickPrompt)}
                      className="w-full text-left rounded-lg border border-slate-200 p-2.5 text-xs text-slate-700 hover:border-amber-400 hover:bg-amber-50/40 transition disabled:opacity-50"
                    >
                      {quickPrompt}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Tab 3: Gateway Specs & Runtime Status */}
            {sidebarTab === 'status' && (
              <div className="p-3.5 space-y-3 animate-in fade-in duration-100">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-semibold text-slate-600">Gateway Runtime</span>
                  <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-bold ${statusToneClasses[presentation.tone]}`}>
                    {presentation.label}
                  </span>
                </div>
                <p className="text-[11px] leading-relaxed text-slate-500">{presentation.description}</p>
                
                <div className="divide-y divide-slate-100 rounded-lg border border-slate-200 bg-slate-50/80 text-xs">
                  <div className="flex justify-between px-3 py-2">
                    <span className="text-slate-500">Provider</span>
                    <span className="font-bold capitalize text-slate-800">{status.provider}</span>
                  </div>
                  <div className="flex justify-between px-3 py-2">
                    <span className="text-slate-500">Model</span>
                    <span className="font-bold text-slate-800">{status.modelConfigured ? 'Configured' : 'Not configured'}</span>
                  </div>
                  <div className="flex justify-between px-3 py-2">
                    <span className="text-slate-500">Access Scope</span>
                    <span className="font-bold text-slate-800">Internal Only</span>
                  </div>
                </div>

                {isSuperadmin && (
                  <Link
                    href="/admin/settings"
                    className="inline-flex h-9 w-full items-center justify-center gap-1.5 rounded-lg border border-slate-300 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition"
                  >
                    <Settings2 className="h-3.5 w-3.5" />
                    Configure in Settings
                  </Link>
                )}
              </div>
            )}

            </div>
          </aside>

        </section>

      </div>
    </main>
  );
}
