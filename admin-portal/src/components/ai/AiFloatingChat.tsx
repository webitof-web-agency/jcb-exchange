'use client';

import Link from 'next/link';
import { isAxiosError } from 'axios';
import {
  Archive,
  Bot,
  History,
  Loader2,
  MessageCircle,
  Plus,
  Send,
  Settings2,
  Sparkles,
  X,
} from 'lucide-react';
import { useEffect, useMemo, useRef, useState, type KeyboardEvent, type PointerEvent } from 'react';
import { toast } from 'react-toastify';
import api from '@/lib/api';
import { hasAnyPermission } from '@/lib/permissionUtils';
import { purifyAiHtml } from '@/lib/safeHtml';
import { useAuthStore } from '@/store/authStore';
import { notifyAiConversationUpdated, subscribeToAiConversationUpdates } from './aiConversationSync';

type Conversation = {
  id: string;
  title: string;
  status: 'ACTIVE' | 'ARCHIVED';
  lastMessageAt: string | null;
  createdAt: string;
  updatedAt: string;
};

type ConversationMessage = {
  id: string;
  conversationId: string;
  role: 'USER' | 'ASSISTANT';
  content: string;
  requestId?: string | null;
  provider?: string | null;
  modelAlias?: string | null;
  toolName?: string | null;
  createdAt: string;
};

type AiStatus = {
  enabled: boolean;
  provider: string;
  modelConfigured: boolean;
  keyConfigured: boolean;
  configurationError?: string | null;
};

type ApiError = { error?: string; code?: string };
type ChatPanelPosition = { left: number; top: number };

const CHAT_PANEL_POSITION_KEY = 'jcb-intelligence-hub-chat-panel-position';

const defaultStatus: AiStatus = {
  enabled: false,
  provider: 'openai',
  modelConfigured: false,
  keyConfigured: false,
};

const readError = (error: unknown, fallback: string) => {
  if (isAxiosError<ApiError>(error)) return error.response?.data?.error || fallback;
  return error instanceof Error ? error.message : fallback;
};

const formatTime = (value: string | null | undefined) => {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
};

const displayTitle = (value: string) => value.length > 28 ? `${value.slice(0, 28).trim()}…` : value;

export default function AiFloatingChat() {
  const user = useAuthStore((state) => state.user);
  const [isOpen, setIsOpen] = useState(false);
  const [status, setStatus] = useState<AiStatus>(defaultStatus);
  const [statusLoading, setStatusLoading] = useState(false);
  const [statusError, setStatusError] = useState<string | null>(null);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeConversationId, setActiveConversationId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ConversationMessage[]>([]);
  const [draft, setDraft] = useState('');
  const [historyLoading, setHistoryLoading] = useState(false);
  const [messagesLoading, setMessagesLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [panelPosition, setPanelPosition] = useState<ChatPanelPosition | null>(() => {
    if (typeof window === 'undefined') return null;
    try {
      const savedPosition = window.localStorage.getItem(CHAT_PANEL_POSITION_KEY);
      if (!savedPosition) return null;
      const parsed = JSON.parse(savedPosition) as Partial<ChatPanelPosition>;
      return typeof parsed.left === 'number' && typeof parsed.top === 'number'
        ? { left: parsed.left, top: parsed.top }
        : null;
    } catch {
      return null;
    }
  });
  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const activeConversationIdRef = useRef<string | null>(null);
  const panelRef = useRef<HTMLElement | null>(null);
  const dragRef = useRef<{ pointerId: number; startX: number; startY: number; startLeft: number; startTop: number } | null>(null);

  const canUse = Boolean(
    user && (
      user.role === 'SUPER_ADMIN'
      || user.role === 'ADMIN'
      || (user.role === 'EMPLOYEE' && hasAnyPermission(user.permissions, ['ai.use']))
    ),
  );
  const settingsHref = user?.role === 'EMPLOYEE' ? '/employee/settings' : '/admin/settings';
  const activeConversation = useMemo(
    () => conversations.find((conversation) => conversation.id === activeConversationId) || null,
    [activeConversationId, conversations],
  );
  const canSend = Boolean(
    draft.trim()
    && status.enabled
    && !statusLoading
    && !sending
    && activeConversation?.status !== 'ARCHIVED',
  );

  useEffect(() => {
    activeConversationIdRef.current = activeConversationId;
  }, [activeConversationId]);

  const clampPanelPosition = (left: number, top: number) => {
    const rect = panelRef.current?.getBoundingClientRect();
    const panelWidth = rect?.width || 760;
    const panelHeight = rect?.height || Math.min(720, window.innerHeight - 40);
    return {
      left: Math.max(8, Math.min(left, window.innerWidth - panelWidth - 8)),
      top: Math.max(8, Math.min(top, window.innerHeight - panelHeight - 8)),
    };
  };

  const handlePanelPointerDown = (event: PointerEvent<HTMLElement>) => {
    if (event.pointerType === 'touch' && window.innerWidth < 640) return;
    if (event.button !== 0 || (event.target as HTMLElement).closest('button, a, input, textarea, select')) return;
    const rect = panelRef.current?.getBoundingClientRect();
    if (!rect) return;
    const position = clampPanelPosition(rect.left, rect.top);
    setPanelPosition(position);
    dragRef.current = { pointerId: event.pointerId, startX: event.clientX, startY: event.clientY, startLeft: position.left, startTop: position.top };
    event.currentTarget.setPointerCapture(event.pointerId);
    event.preventDefault();
  };

  const handlePanelPointerMove = (event: PointerEvent<HTMLElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    setPanelPosition(clampPanelPosition(drag.startLeft + event.clientX - drag.startX, drag.startTop + event.clientY - drag.startY));
  };

  const handlePanelPointerUp = (event: PointerEvent<HTMLElement>) => {
    if (!dragRef.current || dragRef.current.pointerId !== event.pointerId) return;
    dragRef.current = null;
    const finalPosition = panelPosition;
    if (finalPosition) {
      try {
        window.localStorage.setItem(CHAT_PANEL_POSITION_KEY, JSON.stringify(finalPosition));
      } catch {
        // Position persistence is optional; dragging remains usable if storage is unavailable.
      }
    }
  };

  useEffect(() => {
    if (!isOpen || !canUse) return undefined;
    let cancelled = false;

    const loadPanel = async () => {
      setHistoryLoading(true);
      setMessagesLoading(true);
      setStatusLoading(true);
      setError(null);
      setStatusError(null);
      try {
        const [statusResponse, historyResponse] = await Promise.all([
          api.get<{ success: boolean } & AiStatus>('/ai/status'),
          api.get<{ success: boolean; conversations: Conversation[] }>('/ai/history'),
        ]);
        if (cancelled) return;
        const nextConversations = historyResponse.data.conversations || [];
        const currentConversationId = activeConversationIdRef.current;
        const nextActiveId = currentConversationId && nextConversations.some((item) => item.id === currentConversationId)
          ? currentConversationId
          : nextConversations.find((item) => item.status === 'ACTIVE')?.id || nextConversations[0]?.id || null;
        setStatus({
          enabled: Boolean(statusResponse.data.enabled),
          provider: statusResponse.data.provider || 'configured provider',
          modelConfigured: Boolean(statusResponse.data.modelConfigured),
          keyConfigured: Boolean(statusResponse.data.keyConfigured),
          configurationError: statusResponse.data.configurationError || null,
        });
        setConversations(nextConversations);
        setActiveConversationId(nextActiveId);
        if (nextActiveId) {
          const messagesResponse = await api.get<{ success: boolean; messages: ConversationMessage[] }>(`/ai/history/${nextActiveId}/messages`);
          if (!cancelled) setMessages(messagesResponse.data.messages || []);
        } else {
          setMessages([]);
        }
      } catch (nextError) {
        if (!cancelled) {
          const message = readError(nextError, 'The Intelligence Hub could not be loaded.');
          setError(message);
          setStatusError(message);
        }
      } finally {
        if (!cancelled) {
          setHistoryLoading(false);
          setMessagesLoading(false);
          setStatusLoading(false);
        }
      }
    };

    void loadPanel();
    return () => {
      cancelled = true;
    };
  }, [canUse, isOpen]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }, [messages, sending]);

  useEffect(() => {
    if (!canUse || !isOpen) return undefined;
    const unsubscribe = subscribeToAiConversationUpdates(({ conversationId }) => {
      void (async () => {
        try {
          const [historyResponse, messagesResponse] = await Promise.all([
            api.get<{ success: boolean; conversations: Conversation[] }>('/ai/history'),
            api.get<{ success: boolean; messages: ConversationMessage[] }>(`/ai/history/${conversationId}/messages`),
          ]);
          setConversations(historyResponse.data.conversations || []);
          setActiveConversationId(conversationId);
          setMessages(messagesResponse.data.messages || []);
        } catch {
          // The next explicit open/history refresh will reconcile the panel if another tab is closing.
        }
      })();
    });
    return unsubscribe;
  }, [canUse, isOpen]);

  if (!canUse) return null;

  const loadConversationMessages = async (conversationId: string) => {
    setMessagesLoading(true);
    setError(null);
    setActiveConversationId(conversationId);
    try {
      const response = await api.get<{ success: boolean; messages: ConversationMessage[] }>(`/ai/history/${conversationId}/messages`);
      setMessages(response.data.messages || []);
      notifyAiConversationUpdated({ conversationId });
    } catch (nextError) {
      const message = readError(nextError, 'Conversation history could not be loaded.');
      setError(message);
      toast.error(message);
    } finally {
      setMessagesLoading(false);
    }
  };

  const handleNewConversation = () => {
    setActiveConversationId(null);
    setMessages([]);
    setDraft('');
    setError(null);
  };

  const handleArchive = async (conversationId: string) => {
    try {
      await api.patch(`/ai/history/${conversationId}`, { archived: true });
      setConversations((items) => items.map((item) => item.id === conversationId ? { ...item, status: 'ARCHIVED' } : item));
      if (activeConversationId === conversationId) handleNewConversation();
      toast.success('Conversation archived.');
    } catch (nextError) {
      toast.error(readError(nextError, 'Conversation could not be archived.'));
    }
  };

  const handleSend = async () => {
    const content = draft.trim();
    if (!content || !canSend) return;
    const optimisticId = `pending-${Date.now()}`;
    const optimisticMessage: ConversationMessage = {
      id: optimisticId,
      conversationId: activeConversationId || 'pending',
      role: 'USER',
      content,
      createdAt: new Date().toISOString(),
    };
    setMessages((items) => [...items, optimisticMessage]);
    setDraft('');
    setSending(true);
    setError(null);
    try {
      const response = await api.post<{
        success: boolean;
        conversationId: string;
        requestId: string;
        provider: string;
        model: string;
        answer: string;
      }>('/ai/chat', {
        message: content,
        ...(activeConversationId ? { conversationId: activeConversationId } : {}),
      });
      const conversationId = response.data.conversationId;
      setActiveConversationId(conversationId);
      const [historyResponse, messagesResponse] = await Promise.all([
        api.get<{ success: boolean; conversations: Conversation[] }>('/ai/history'),
        api.get<{ success: boolean; messages: ConversationMessage[] }>(`/ai/history/${conversationId}/messages`),
      ]);
      setConversations(historyResponse.data.conversations || []);
      setMessages(messagesResponse.data.messages || []);
      notifyAiConversationUpdated({ conversationId });
    } catch (nextError) {
      const message = readError(nextError, 'The AI request could not be completed.');
      setMessages((items) => items.filter((item) => item.id !== optimisticId));
      setError(message);
      toast.error(message);
    } finally {
      setSending(false);
    }
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      void handleSend();
    }
  };

  return (
    <>
      {!isOpen ? (
        <div className="fixed bottom-6 right-6 z-40 flex items-center gap-2.5 animate-float-slow group select-none">
          {/* Elegant Pill Label on Hover */}
          <span className="pointer-events-none hidden sm:inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-white/95 px-3 py-1.5 text-xs font-semibold text-slate-800 shadow-[0_8px_20px_rgba(0,0,0,0.10)] backdrop-blur-md opacity-0 -translate-x-2 transition-all duration-200 group-hover:opacity-100 group-hover:translate-x-0">
            <span>JCB Intelligence Hub</span>
          </span>

          <button
            type="button"
            onClick={() => setIsOpen(true)}
            className="relative flex h-14 w-14 sm:h-[58px] sm:w-[58px] items-center justify-center rounded-full border border-slate-300/90 bg-gradient-to-b from-white via-slate-50 to-slate-100/90 text-slate-600 shadow-[0_10px_25px_rgba(15,23,42,0.12),0_2px_8px_rgba(15,23,42,0.06)] transition-all duration-300 hover:scale-105 hover:border-slate-400 hover:text-slate-900 hover:shadow-[0_14px_32px_rgba(15,23,42,0.18)] active:scale-95 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-slate-300/50 cursor-pointer"
            aria-label="Open JCB Intelligence Hub"
            title="Open JCB Intelligence Hub"
          >
            {/* Message Logo in Gray Color (No Star) */}
            <MessageCircle className="h-6 w-6 text-slate-600 transition-transform duration-300 group-hover:scale-110 group-hover:text-slate-900" aria-hidden="true" />

            {/* Glowing Live Green Dot Indicator */}
            <span className="absolute -right-0.5 -top-0.5 flex h-3.5 w-3.5" aria-hidden="true">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
              <span className="relative inline-flex h-3.5 w-3.5 rounded-full border-2 border-white bg-emerald-500 shadow-xs" />
            </span>
          </button>
        </div>
      ) : null}

      {isOpen ? (
        <section
          ref={panelRef}
          style={panelPosition ? { left: `${panelPosition.left}px`, top: `${panelPosition.top}px`, right: 'auto', bottom: 'auto' } : undefined}
          className={`fixed inset-x-0 bottom-0 z-50 flex h-[min(760px,100dvh)] w-full flex-col overflow-hidden rounded-t-2xl border border-slate-700 bg-white shadow-[0_24px_80px_rgba(3,8,23,0.35)] sm:bottom-5 sm:right-5 sm:left-auto sm:h-[min(720px,calc(100dvh-2.5rem))] sm:w-[min(760px,calc(100vw-2.5rem))] sm:rounded-2xl ${panelPosition ? 'sm:!bottom-auto sm:!right-auto' : ''}`}
          aria-label="JCB Intelligence Hub chat"
        >
          <header
            className="flex cursor-grab touch-none select-none items-center justify-between gap-3 bg-gradient-to-r from-[#030817] via-[#071735] to-[#132746] px-4 py-3 text-white active:cursor-grabbing"
            onPointerDown={handlePanelPointerDown}
            onPointerMove={handlePanelPointerMove}
            onPointerUp={handlePanelPointerUp}
            onPointerCancel={handlePanelPointerUp}
            title="Drag to move the chat window"
          >
            <div className="flex min-w-0 items-center gap-3">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-[#FFC107]/45 bg-[#FFC107]/12 text-[#FFC107]">
                <Sparkles className="h-5 w-5" aria-hidden="true" />
              </span>
              <div className="min-w-0">
                <p className="truncate text-sm font-bold">JCB Intelligence Hub</p>
                <p className="mt-0.5 truncate text-[11px] text-slate-300">Internal operations assistant · read-only guidance</p>
              </div>
            </div>
            <div className="flex shrink-0 items-center gap-1">
              <button type="button" onClick={handleNewConversation} className="rounded-lg p-2 text-slate-300 transition hover:bg-white/10 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#FFC107]" aria-label="Start new conversation" title="New conversation">
                <Plus className="h-4 w-4" aria-hidden="true" />
              </button>
              <button type="button" onClick={() => setIsOpen(false)} className="rounded-lg p-2 text-slate-300 transition hover:bg-white/10 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#FFC107]" aria-label="Close JCB Intelligence Hub" title="Close">
                <X className="h-4 w-4" aria-hidden="true" />
              </button>
            </div>
          </header>

          <div className="flex min-h-0 flex-1">
            <aside className="hidden w-52 shrink-0 flex-col border-r border-slate-200 bg-slate-50 sm:flex">
              <div className="flex items-center justify-between border-b border-slate-200 px-3 py-3">
                <p className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-[0.14em] text-slate-500"><History className="h-3.5 w-3.5" aria-hidden="true" /> History</p>
                <button type="button" onClick={handleNewConversation} className="rounded-md p-1.5 text-slate-500 hover:bg-slate-200 hover:text-slate-900" aria-label="New conversation" title="New conversation"><Plus className="h-4 w-4" aria-hidden="true" /></button>
              </div>
              <div className="min-h-0 flex-1 space-y-1 overflow-y-auto p-2">
                {historyLoading ? <div className="flex justify-center py-5 text-slate-400"><Loader2 className="h-4 w-4 animate-spin" aria-label="Loading history" /></div> : null}
                {!historyLoading && conversations.length === 0 ? <p className="px-2 py-5 text-xs leading-5 text-slate-500">Your saved conversations will appear here.</p> : null}
                {conversations.map((conversation) => (
                  <div key={conversation.id} className={`group flex items-start gap-1 rounded-lg border px-2 py-2 ${conversation.id === activeConversationId ? 'border-[#FFC107]/60 bg-[#FFF8E1]' : 'border-transparent hover:border-slate-200 hover:bg-white'}`}>
                    <button type="button" onClick={() => void loadConversationMessages(conversation.id)} className="min-w-0 flex-1 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#C28B00]">
                      <span className="block truncate text-xs font-semibold text-slate-800">{displayTitle(conversation.title)}</span>
                      <span className="mt-1 block text-[10px] text-slate-500">{conversation.status === 'ARCHIVED' ? 'Archived' : formatTime(conversation.lastMessageAt || conversation.updatedAt)}</span>
                    </button>
                    {conversation.status === 'ACTIVE' ? <button type="button" onClick={() => void handleArchive(conversation.id)} className="rounded p-1 text-slate-400 opacity-0 transition group-hover:opacity-100 hover:bg-slate-200 hover:text-slate-800 focus-visible:opacity-100 focus-visible:outline-none" aria-label={`Archive ${conversation.title}`} title="Archive"><Archive className="h-3.5 w-3.5" aria-hidden="true" /></button> : null}
                  </div>
                ))}
              </div>
            </aside>

            <div className="flex min-w-0 flex-1 flex-col">
              <div className="border-b border-slate-200 bg-white px-4 py-2 sm:hidden">
                <label className="sr-only" htmlFor="ai-conversation-select">Conversation history</label>
                <select id="ai-conversation-select" value={activeConversationId || ''} onChange={(event) => event.target.value ? void loadConversationMessages(event.target.value) : handleNewConversation()} className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-semibold text-slate-700 focus:border-[#C28B00] focus:outline-none">
                  <option value="">New conversation</option>
                  {conversations.map((conversation) => <option key={conversation.id} value={conversation.id}>{conversation.title}{conversation.status === 'ARCHIVED' ? ' (archived)' : ''}</option>)}
                </select>
              </div>

              <div className="min-h-0 flex-1 space-y-3 overflow-y-auto bg-slate-50/70 px-4 py-4" aria-live="polite">
                {messagesLoading ? <div className="flex h-full items-center justify-center text-slate-400"><Loader2 className="h-5 w-5 animate-spin" aria-label="Loading messages" /></div> : null}
                {!messagesLoading && messages.length === 0 ? (
                  <div className="flex h-full flex-col items-center justify-center px-6 text-center">
                    <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[#FFC107]/15 text-[#9A6700]"><Bot className="h-6 w-6" aria-hidden="true" /></span>
                    <h2 className="mt-3 text-sm font-bold text-slate-900">How can I help with internal operations?</h2>
                    <p className="mt-1 max-w-xs text-xs leading-5 text-slate-500">Ask for a read-only summary, checklist, or operational explanation. High-risk actions still require human review.</p>
                  </div>
                ) : null}
                {!messagesLoading ? messages.map((message) => (
                  <div key={message.id} className={`flex ${message.role === 'USER' ? 'justify-end' : 'justify-start'}`}>
                    <div className={`max-w-[88%] rounded-2xl px-3.5 py-2.5 text-sm leading-6 shadow-sm ${message.role === 'USER' ? 'rounded-br-md bg-[#061532] text-white' : 'rounded-bl-md border border-slate-200 bg-white text-slate-800'}`}>
                      {message.role === 'ASSISTANT' ? <div className="prose prose-sm max-w-none text-inherit [&_a]:text-[#0B5FFF]" dangerouslySetInnerHTML={{ __html: purifyAiHtml(message.content) }} /> : <p className="whitespace-pre-wrap">{message.content}</p>}
                      <p className={`mt-1 text-[10px] ${message.role === 'USER' ? 'text-slate-300' : 'text-slate-400'}`}>{formatTime(message.createdAt)}</p>
                    </div>
                  </div>
                )) : null}
                {sending ? <div className="flex justify-start"><div className="rounded-2xl rounded-bl-md border border-slate-200 bg-white px-4 py-3 text-slate-400"><Loader2 className="h-4 w-4 animate-spin" aria-label="AI is responding" /></div></div> : null}
                <div ref={messagesEndRef} />
              </div>

              {statusError ? <div className="border-t border-amber-200 bg-amber-50 px-4 py-2 text-xs text-amber-900" role="status">{statusError}</div> : null}
              {!statusLoading && !status.enabled ? (
                <div className="border-t border-amber-200 bg-amber-50 px-4 py-2.5 text-xs leading-5 text-amber-900">
                  <p className="font-semibold">AI provider needs configuration.</p>
                  <p className="mt-0.5">{user?.role === 'EMPLOYEE' && !hasAnyPermission(user.permissions, ['ai.manage']) ? 'Ask an authorised operator to add the provider key in Settings.' : 'Add and test the provider key in Settings, then return here.'}</p>
                  {user?.role !== 'EMPLOYEE' || hasAnyPermission(user.permissions, ['ai.manage']) ? <Link href={settingsHref} className="mt-1 inline-flex items-center gap-1 font-bold text-[#8A5B00] hover:underline"><Settings2 className="h-3.5 w-3.5" aria-hidden="true" /> Open AI settings</Link> : null}
                </div>
              ) : null}
              {error && !statusError ? <div className="border-t border-red-200 bg-red-50 px-4 py-2 text-xs text-red-800" role="alert">{error}</div> : null}

              <div className="border-t border-slate-200 bg-white p-3">
                <div className="flex items-end gap-2 rounded-xl border border-slate-300 bg-white p-2 shadow-sm focus-within:border-[#C28B00] focus-within:ring-2 focus-within:ring-[#FFC107]/20">
                  <label className="sr-only" htmlFor="ai-floating-chat-input">Message JCB Intelligence Hub</label>
                  <textarea id="ai-floating-chat-input" value={draft} onChange={(event) => setDraft(event.target.value)} onKeyDown={handleKeyDown} rows={2} maxLength={4000} disabled={!status.enabled || sending || activeConversation?.status === 'ARCHIVED'} placeholder={activeConversation?.status === 'ARCHIVED' ? 'Start a new conversation to continue…' : 'Ask a read-only operations question…'} className="min-h-12 flex-1 resize-none border-0 bg-transparent px-1 py-1 text-sm text-slate-900 outline-none placeholder:text-slate-400 disabled:cursor-not-allowed disabled:bg-slate-50" />
                  <button type="button" onClick={() => void handleSend()} disabled={!canSend} className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-[#FFC107] text-[#111827] transition hover:bg-[#f2b500] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#C28B00] disabled:cursor-not-allowed disabled:opacity-45" aria-label="Send message" title="Send message"><Send className="h-4 w-4" aria-hidden="true" /></button>
                </div>
                <p className="mt-1.5 px-1 text-[10px] text-slate-400">Enter to send · Shift+Enter for a new line · sensitive identifiers are redacted before provider access</p>
              </div>
            </div>
          </div>
        </section>
      ) : null}
    </>
  );
}
