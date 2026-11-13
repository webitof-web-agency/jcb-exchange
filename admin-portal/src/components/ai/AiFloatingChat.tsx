'use client';

import { isAxiosError } from 'axios';
import {
  Archive,
  Bot,
  CalendarDays,
  Check,
  ChevronDown,
  Copy,
  History,
  Loader2,
  Maximize2,
  Mic,
  MicOff,
  MessageCircle,
  Minimize2,
  PanelLeftClose,
  PanelLeftOpen,
  Plus,
  Search,
  Send,
  Sparkles,
  Square,
  Trash2,
  Volume2,
  VolumeX,
  X,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent, type PointerEvent } from 'react';
import { toast } from 'react-toastify';
import api from '@/lib/api';
import { hasAnyPermission } from '@/lib/permissionUtils';
import { purifyAiHtml } from '@/lib/safeHtml';
import { useAuthStore } from '@/store/authStore';
import { notifyAiConversationUpdated, subscribeToAiConversationUpdates } from './aiConversationSync';
import { filterAiModelOptions, type AiModelOption } from './aiModelPicker';
import { formatAiTimestamp, normalizeAiDisplayText } from './aiDisplay';
import { choosePreferredSpeechVoice, getSpeechRecognitionConstructor, getVoiceInputErrorMessage, getVoiceInputStatusLabel, getVoiceOutputButtonLabel, joinVoiceDraft, stripAiVoiceMarkup, type SpeechRecognitionLike } from './aiVoice';

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
  toolSource?: string | null;
  toolFetchedAt?: string | null;
  createdAt: string;
};

type AiStatus = {
  enabled: boolean;
  provider: string;
  model: string;
  modelConfigured: boolean;
  keyConfigured: boolean;
  configurationError?: string | null;
};

type ApiError = { error?: string; code?: string };
type ChatPanelPosition = { left: number; top: number };
type AiModelsResponse = {
  success: boolean;
  provider: string;
  selectedModel: string;
  models: AiModelOption[];
};

const CHAT_PANEL_POSITION_KEY = 'jcb-intelligence-hub-chat-panel-position';

const defaultStatus: AiStatus = {
  enabled: false,
  provider: 'openai',
  model: 'not configured',
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
  const [isExpanded, setIsExpanded] = useState(false);
  const [mobileHistoryOpen, setMobileHistoryOpen] = useState(false);
  const [historyCollapsed, setHistoryCollapsed] = useState(false);
  const [isDesktopViewport, setIsDesktopViewport] = useState(true);
  const [copiedMessageId, setCopiedMessageId] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [confirmClearAll, setConfirmClearAll] = useState(false);
  const [clearingAll, setClearingAll] = useState(false);
  const [status, setStatus] = useState<AiStatus>(defaultStatus);
  const [statusLoading, setStatusLoading] = useState(false);
  const [statusError, setStatusError] = useState<string | null>(null);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [historyQuery, setHistoryQuery] = useState('');
  const [olderHistoryOpen, setOlderHistoryOpen] = useState(false);
  const [modelOptions, setModelOptions] = useState<AiModelOption[]>([]);
  const [selectedModel, setSelectedModel] = useState<string | null>(null);
  const [modelQuery, setModelQuery] = useState('');
  const [modelMenuOpen, setModelMenuOpen] = useState(false);
  const [modelsLoading, setModelsLoading] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [voiceOutputEnabled, setVoiceOutputEnabled] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [voiceSupported, setVoiceSupported] = useState(false);
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
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const modelMenuRef = useRef<HTMLDivElement | null>(null);
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const voiceDraftPrefixRef = useRef('');
  const voiceListeningIntentRef = useRef(false);
  const voiceRestartTimerRef = useRef<number | null>(null);
  const voiceFinalSegmentsRef = useRef<Record<number, string>>({});
  const voiceInterimSegmentsRef = useRef<Record<number, string>>({});
  const voiceCommittedTextRef = useRef('');
  const voiceSessionIdRef = useRef(0);
  const speechUtteranceRef = useRef<SpeechSynthesisUtterance | null>(null);
  const latestPositionRef = useRef<ChatPanelPosition | null>(panelPosition);
  const dragRef = useRef<{ pointerId: number; startX: number; startY: number; startLeft: number; startTop: number } | null>(null);

  const canUse = Boolean(
    user && (
      user.role === 'SUPER_ADMIN'
      || user.role === 'ADMIN'
      || (user.role === 'EMPLOYEE' && hasAnyPermission(user.permissions, ['ai.use']))
    ),
  );
  const activeConversation = useMemo(
    () => conversations.find((conversation) => conversation.id === activeConversationId) || null,
    [activeConversationId, conversations],
  );
  const groupedConversations = useMemo(() => {
    const query = historyQuery.trim().toLowerCase();
    const matching = conversations.filter((conversation) => {
      if (!query) return true;
      return `${conversation.title} ${conversation.status}`.toLowerCase().includes(query);
    });
    const getTimestamp = (conversation: Conversation) => new Date(conversation.lastMessageAt || conversation.updatedAt || conversation.createdAt).getTime();
    const latestTimestamp = matching.reduce((latest, conversation) => Math.max(latest, getTimestamp(conversation)), 0);
    const monthStart = new Date(latestTimestamp || 0);
    monthStart.setDate(1);
    monthStart.setHours(0, 0, 0, 0);
    const recentCutoff = latestTimestamp - 7 * 24 * 60 * 60 * 1000;

    return {
      recent: matching.filter((conversation) => getTimestamp(conversation) >= recentCutoff),
      month: matching.filter((conversation) => {
        const timestamp = getTimestamp(conversation);
        return timestamp < recentCutoff && timestamp >= monthStart.getTime();
      }),
      older: matching.filter((conversation) => getTimestamp(conversation) < monthStart.getTime()),
    };
  }, [conversations, historyQuery]);
  const canSend = Boolean(
    draft.trim()
    && status.enabled
    && !statusLoading
    && !sending
    && activeConversation?.status !== 'ARCHIVED',
  );
  const availableModelOptions = useMemo(() => {
    if (modelOptions.length) return modelOptions;
    if (!status.model || status.model === 'not configured') return [];
    return [{
      id: status.model,
      name: status.model,
      capabilities: ['chat'],
      transport: 'chat_completions' as const,
    }];
  }, [modelOptions, status.model]);
  const filteredModelOptions = useMemo(
    () => filterAiModelOptions(availableModelOptions, modelQuery),
    [availableModelOptions, modelQuery],
  );

  const stopSpeaking = useCallback(() => {
    speechUtteranceRef.current = null;
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) window.speechSynthesis.cancel();
    setIsSpeaking(false);
  }, []);

  const stopVoiceInput = useCallback(() => {
    voiceListeningIntentRef.current = false;
    if (voiceRestartTimerRef.current !== null) {
      window.clearTimeout(voiceRestartTimerRef.current);
      voiceRestartTimerRef.current = null;
    }
    try {
      recognitionRef.current?.stop();
    } catch {
      // Recognition may already be ending; the state reset below is authoritative.
    }
    setIsListening(false);
    setIsTranscribing(false);
  }, []);

  const closePanel = useCallback(() => {
    stopVoiceInput();
    stopSpeaking();
    setMobileHistoryOpen(false);
    setIsOpen(false);
  }, [stopSpeaking, stopVoiceInput]);

  useEffect(() => {
    activeConversationIdRef.current = activeConversationId;
  }, [activeConversationId]);

  useEffect(() => {
    latestPositionRef.current = panelPosition;
  }, [panelPosition]);

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      setVoiceSupported(Boolean(getSpeechRecognitionConstructor()) && 'speechSynthesis' in window);
    });
    return () => {
      window.cancelAnimationFrame(frame);
      stopVoiceInput();
      recognitionRef.current = null;
      stopSpeaking();
    };
  }, [stopSpeaking, stopVoiceInput]);

  useEffect(() => {
    if (!modelMenuOpen) return undefined;
    const closeOnOutsideClick = (event: globalThis.MouseEvent) => {
      if (modelMenuRef.current && !modelMenuRef.current.contains(event.target as Node)) setModelMenuOpen(false);
    };
    document.addEventListener('mousedown', closeOnOutsideClick);
    return () => document.removeEventListener('mousedown', closeOnOutsideClick);
  }, [modelMenuOpen]);

  const clampPanelPosition = useCallback((left: number, top: number) => {
    const rect = panelRef.current?.getBoundingClientRect();
    const margin = 12;
    const panelWidth = Math.min(rect?.width || 820, window.innerWidth - margin * 2);
    const panelHeight = Math.min(rect?.height || 660, window.innerHeight - margin * 2);
    return {
      left: Math.max(margin, Math.min(left, Math.max(margin, window.innerWidth - panelWidth - margin))),
      top: Math.max(margin, Math.min(top, Math.max(margin, window.innerHeight - panelHeight - margin))),
    };
  }, []);

  useEffect(() => {
    const syncViewport = () => {
      const desktop = window.innerWidth >= 640;
      setIsDesktopViewport(desktop);
      if (desktop && isOpen && !isExpanded && latestPositionRef.current) {
        const clamped = clampPanelPosition(latestPositionRef.current.left, latestPositionRef.current.top);
        if (clamped.left !== latestPositionRef.current.left || clamped.top !== latestPositionRef.current.top) {
          setPanelPosition(clamped);
        }
      }
    };

    const frame = window.requestAnimationFrame(syncViewport);
    window.addEventListener('resize', syncViewport);
    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener('resize', syncViewport);
    };
  }, [clampPanelPosition, isExpanded, isOpen]);

  useEffect(() => {
    if (!isOpen) return undefined;
    const handleEscape = (event: globalThis.KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      if (modelMenuOpen) {
        setModelMenuOpen(false);
      } else if (mobileHistoryOpen) {
        setMobileHistoryOpen(false);
      } else if (isExpanded) {
        setIsExpanded(false);
      } else {
        closePanel();
      }
    };
    window.addEventListener('keydown', handleEscape);
    return () => window.removeEventListener('keydown', handleEscape);
  }, [closePanel, isExpanded, isOpen, mobileHistoryOpen, modelMenuOpen]);

  const speakAiResponse = useCallback((content: string) => {
    if (!voiceOutputEnabled || typeof window === 'undefined' || !('speechSynthesis' in window)) return;
    const text = stripAiVoiceMarkup(content).slice(0, 4_000);
    if (!text) return;
    stopSpeaking();
    const utterance = new SpeechSynthesisUtterance(text);
    const hasDevanagari = /[\u0900-\u097F]/u.test(text);
    utterance.lang = hasDevanagari ? 'hi-IN' : 'en-IN';
    utterance.rate = hasDevanagari ? 0.94 : 0.98;
    utterance.pitch = 1;
    utterance.volume = 1;
    const preferredVoice = choosePreferredSpeechVoice(window.speechSynthesis.getVoices(), text);
    if (preferredVoice) utterance.voice = preferredVoice;
    speechUtteranceRef.current = utterance;
    utterance.onstart = () => {
      if (speechUtteranceRef.current === utterance) setIsSpeaking(true);
    };
    utterance.onend = () => {
      if (speechUtteranceRef.current === utterance) {
        speechUtteranceRef.current = null;
        setIsSpeaking(false);
      }
    };
    utterance.onerror = () => {
      if (speechUtteranceRef.current === utterance) {
        speechUtteranceRef.current = null;
        setIsSpeaking(false);
      }
    };
    setIsSpeaking(true);
    window.speechSynthesis.speak(utterance);
  }, [stopSpeaking, voiceOutputEnabled]);

  const handlePanelPointerDown = (event: PointerEvent<HTMLElement>) => {
    if (!isDesktopViewport || isExpanded) return;
    if (event.button !== 0 || (event.target as HTMLElement).closest('button, a, input, textarea, select')) return;
    const rect = panelRef.current?.getBoundingClientRect();
    if (!rect) return;
    const position = clampPanelPosition(rect.left, rect.top);
    setPanelPosition(position);
    latestPositionRef.current = position;
    dragRef.current = { pointerId: event.pointerId, startX: event.clientX, startY: event.clientY, startLeft: position.left, startTop: position.top };
    event.currentTarget.setPointerCapture(event.pointerId);
    event.preventDefault();
  };

  const handlePanelPointerMove = (event: PointerEvent<HTMLElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    const next = clampPanelPosition(drag.startLeft + event.clientX - drag.startX, drag.startTop + event.clientY - drag.startY);
    latestPositionRef.current = next;
    setPanelPosition(next);
  };

  const handlePanelPointerUp = (event: PointerEvent<HTMLElement>) => {
    if (!dragRef.current || dragRef.current.pointerId !== event.pointerId) return;
    dragRef.current = null;
    const finalPosition = latestPositionRef.current;
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
      setModelsLoading(true);
      setError(null);
      setStatusError(null);
      try {
        const [statusResponse, historyResponse, modelsResponse] = await Promise.all([
          api.get<{ success: boolean } & AiStatus>('/ai/status'),
          api.get<{ success: boolean; conversations: Conversation[] }>('/ai/history'),
          api.get<AiModelsResponse>('/ai/models').catch(() => null),
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
          model: statusResponse.data.model || 'not configured',
          modelConfigured: Boolean(statusResponse.data.modelConfigured),
          keyConfigured: Boolean(statusResponse.data.keyConfigured),
          configurationError: statusResponse.data.configurationError || null,
        });
        const loadedModels = modelsResponse?.data.models || [];
        setModelOptions(loadedModels);
        setSelectedModel(modelsResponse?.data.selectedModel || statusResponse.data.model || null);
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
          setModelsLoading(false);
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
    const unsubscribe = subscribeToAiConversationUpdates(({ conversationId, action }) => {
      void (async () => {
        try {
          const historyResponse = await api.get<{ success: boolean; conversations: Conversation[] }>('/ai/history');
          setConversations(historyResponse.data.conversations || []);

          if (action === 'cleared') {
            setActiveConversationId(null);
            setMessages([]);
            return;
          }

          if (action === 'deleted') {
            if (activeConversationIdRef.current === conversationId) {
              setActiveConversationId(null);
              setMessages([]);
            }
            return;
          }

          if (conversationId) {
            const messagesResponse = await api.get<{ success: boolean; messages: ConversationMessage[] }>(`/ai/history/${conversationId}/messages`);
            setActiveConversationId(conversationId);
            setMessages(messagesResponse.data.messages || []);
          }
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
    setMobileHistoryOpen(false);
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
    setMobileHistoryOpen(false);
    window.setTimeout(() => textareaRef.current?.focus(), 0);
  };

  const handleCopyMessage = async (messageId: string, content: string) => {
    const plainText = content.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
    try {
      await navigator.clipboard.writeText(plainText || content);
      setCopiedMessageId(messageId);
      window.setTimeout(() => {
        setCopiedMessageId((current) => (current === messageId ? null : current));
      }, 1800);
    } catch {
      toast.error('Response could not be copied.');
    }
  };

  const handleArchive = async (conversationId: string) => {
    try {
      await api.patch(`/ai/history/${conversationId}`, { archived: true });
      setConversations((items) => items.map((item) => item.id === conversationId ? { ...item, status: 'ARCHIVED' } : item));
      if (activeConversationId === conversationId) handleNewConversation();
      notifyAiConversationUpdated({ conversationId, action: 'updated' });
      toast.success('Conversation archived.');
    } catch (nextError) {
      toast.error(readError(nextError, 'Conversation could not be archived.'));
    }
  };

  const handleDelete = async (conversationId: string) => {
    if (deletingId) return;
    setDeletingId(conversationId);
    try {
      await api.delete(`/ai/history/${conversationId}`);
      setConversations((items) => items.filter((item) => item.id !== conversationId));
      setConfirmDeleteId(null);
      if (activeConversationId === conversationId) {
        setActiveConversationId(null);
        setMessages([]);
        setError(null);
      }
      notifyAiConversationUpdated({ conversationId, action: 'deleted' });
      toast.success('Conversation deleted.');
    } catch (nextError) {
      toast.error(readError(nextError, 'Conversation could not be deleted.'));
    } finally {
      setDeletingId(null);
    }
  };

  const handleClearAllHistory = async () => {
    if (clearingAll) return;
    setClearingAll(true);
    try {
      await api.delete('/ai/history');
      setConversations([]);
      setActiveConversationId(null);
      setMessages([]);
      setError(null);
      setConfirmClearAll(false);
      setConfirmDeleteId(null);
      notifyAiConversationUpdated({ action: 'cleared' });
      toast.success('All chat history deleted.');
    } catch (nextError) {
      toast.error(readError(nextError, 'Chat history could not be cleared.'));
    } finally {
      setClearingAll(false);
    }
  };

  const startVoiceRecognition = (requestPermission: boolean) => {
    const Recognition = getSpeechRecognitionConstructor();
    if (!Recognition || !voiceSupported || !voiceListeningIntentRef.current) return;

    const recognition = new Recognition();
    const sessionId = voiceSessionIdRef.current + 1;
    voiceSessionIdRef.current = sessionId;
    recognition.lang = typeof navigator !== 'undefined' && navigator.language.toLowerCase().startsWith('hi') ? 'hi-IN' : 'en-IN';
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.onresult = (event) => {
      if (sessionId !== voiceSessionIdRef.current) return;
      const startIndex = event.resultIndex ?? 0;
      for (let index = startIndex; index < event.results.length; index += 1) {
        const result = event.results[index];
        const transcript = result?.[0]?.transcript?.trim() || '';
        if (!transcript) continue;
        if (result?.isFinal) {
          voiceFinalSegmentsRef.current[index] = transcript;
          delete voiceInterimSegmentsRef.current[index];
        } else {
          voiceInterimSegmentsRef.current[index] = transcript;
        }
      }

      const finalText = Object.keys(voiceFinalSegmentsRef.current)
        .sort((left, right) => Number(left) - Number(right))
        .map((index) => voiceFinalSegmentsRef.current[Number(index)])
        .join(' ');
      const interimText = Object.keys(voiceInterimSegmentsRef.current)
        .sort((left, right) => Number(left) - Number(right))
        .map((index) => voiceInterimSegmentsRef.current[Number(index)])
        .join(' ');
      setDraft(joinVoiceDraft(
        voiceDraftPrefixRef.current,
        joinVoiceDraft(voiceCommittedTextRef.current, finalText, ''),
        interimText,
      ));
      setIsTranscribing(Boolean(interimText));
    };
    recognition.onend = () => {
      if (sessionId !== voiceSessionIdRef.current) return;
      const finalText = Object.keys(voiceFinalSegmentsRef.current)
        .sort((left, right) => Number(left) - Number(right))
        .map((index) => voiceFinalSegmentsRef.current[Number(index)])
        .join(' ');
      voiceCommittedTextRef.current = joinVoiceDraft(voiceCommittedTextRef.current, finalText, '');
      voiceFinalSegmentsRef.current = {};
      voiceInterimSegmentsRef.current = {};
      recognitionRef.current = null;
      setDraft(joinVoiceDraft(voiceDraftPrefixRef.current, voiceCommittedTextRef.current, ''));

      if (!voiceListeningIntentRef.current) {
        setIsListening(false);
        setIsTranscribing(false);
        return;
      }

      setIsListening(true);
      voiceRestartTimerRef.current = window.setTimeout(() => {
        voiceRestartTimerRef.current = null;
        if (voiceListeningIntentRef.current) startVoiceRecognition(false);
      }, 150);
    };
    recognition.onerror = (event) => {
      const code = event.error;
      const shouldStop = !voiceListeningIntentRef.current
        || code === 'not-allowed'
        || code === 'service-not-allowed'
        || code === 'audio-capture'
        || code === 'network';
      if (!shouldStop) return;
      voiceListeningIntentRef.current = false;
      setIsListening(false);
      setIsTranscribing(false);
      recognitionRef.current = null;
      if (code !== 'aborted') toast.error(getVoiceInputErrorMessage(code));
    };
    recognitionRef.current = recognition;

    const startRecognition = async () => {
      try {
        if (requestPermission && navigator.mediaDevices?.getUserMedia) {
          const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
          stream.getTracks().forEach((track) => track.stop());
        }
        if (!voiceListeningIntentRef.current || sessionId !== voiceSessionIdRef.current) return;
        recognition.start();
      } catch (startError) {
        const code = startError instanceof DOMException
          ? startError.name === 'NotAllowedError'
            ? 'not-allowed'
            : startError.name === 'NotFoundError' || startError.name === 'NotReadableError'
              ? 'audio-capture'
              : undefined
          : undefined;
        voiceListeningIntentRef.current = false;
        setIsListening(false);
        setIsTranscribing(false);
        recognitionRef.current = null;
        toast.error(getVoiceInputErrorMessage(code));
      }
    };
    void startRecognition();
  };

  const toggleVoiceInput = () => {
    const Recognition = getSpeechRecognitionConstructor();
    if (!Recognition || !voiceSupported) {
      toast.info('Voice input is not supported in this browser. You can continue by typing.');
      return;
    }
    if (voiceListeningIntentRef.current) {
      stopVoiceInput();
      return;
    }

    voiceListeningIntentRef.current = true;
    voiceDraftPrefixRef.current = draft.trim();
    voiceCommittedTextRef.current = '';
    voiceFinalSegmentsRef.current = {};
    voiceInterimSegmentsRef.current = {};
    setIsListening(true);
    setIsTranscribing(false);
    startVoiceRecognition(true);
  };

  const handleSend = async () => {
    const content = draft.trim();
    if (!content || !canSend) return;
    stopVoiceInput();
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
        ...(selectedModel ? { model: selectedModel } : {}),
        ...(activeConversationId ? { conversationId: activeConversationId } : {}),
      });
      speakAiResponse(response.data.answer);
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

  const renderConversation = (conversation: Conversation) => {
    const isActive = conversation.id === activeConversationId;
    const isConfirming = confirmDeleteId === conversation.id;
    const isDeleting = deletingId === conversation.id;

    return (
      <div
        key={conversation.id}
        className={`group flex items-start gap-1.5 rounded-xl border px-2.5 py-2 transition ${
          isConfirming
            ? 'border-red-200 bg-red-50/70'
            : isActive
              ? 'border-[#FFC107]/70 bg-[#FFF8E1] shadow-2xs'
              : 'border-transparent hover:border-slate-200 hover:bg-white'
        }`}
      >
        {isConfirming ? (
          <div className="flex w-full items-center justify-between gap-2 py-0.5">
            <span className="truncate text-[11px] font-semibold text-red-700">Delete chat?</span>
            <div className="flex shrink-0 items-center gap-1">
              <button
                type="button"
                disabled={isDeleting}
                onClick={() => void handleDelete(conversation.id)}
                className="inline-flex items-center gap-1 rounded-md bg-red-600 px-2 py-1 text-[10px] font-bold text-white transition hover:bg-red-700 disabled:opacity-60"
              >
                {isDeleting ? <Loader2 className="h-3 w-3 animate-spin" aria-hidden="true" /> : null}
                Delete
              </button>
              <button
                type="button"
                disabled={isDeleting}
                onClick={() => setConfirmDeleteId(null)}
                className="rounded-md border border-slate-200 bg-white px-2 py-1 text-[10px] font-semibold text-slate-600 transition hover:bg-slate-100 disabled:opacity-60"
              >
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <>
            <button
              type="button"
              onClick={() => {
                setConfirmDeleteId(null);
                void loadConversationMessages(conversation.id);
              }}
              className="min-w-0 flex-1 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#C28B00]"
            >
              <span className="block truncate text-xs font-semibold text-slate-800">{displayTitle(conversation.title)}</span>
              <span className="mt-0.5 block text-[10px] text-slate-500">
                {conversation.status === 'ARCHIVED' ? 'Archived' : formatTime(conversation.lastMessageAt || conversation.updatedAt)}
              </span>
            </button>
            <div
              className={`flex shrink-0 items-center gap-0.5 transition ${
                isActive ? 'opacity-100' : 'opacity-100 md:opacity-0 md:group-hover:opacity-100 md:group-focus-within:opacity-100'
              }`}
            >
              {conversation.status === 'ACTIVE' ? (
                <button
                  type="button"
                  onClick={() => void handleArchive(conversation.id)}
                  className="rounded-md p-1.5 text-slate-400 transition hover:bg-slate-200/80 hover:text-slate-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#C28B00]"
                  aria-label={`Archive ${conversation.title}`}
                  title="Archive"
                >
                  <Archive className="h-3.5 w-3.5" aria-hidden="true" />
                </button>
              ) : null}
              <button
                type="button"
                onClick={(event) => {
                  event.stopPropagation();
                  setConfirmClearAll(false);
                  setConfirmDeleteId(conversation.id);
                }}
                className="rounded-md p-1.5 text-slate-400 transition hover:bg-red-100 hover:text-red-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500"
                aria-label={`Delete ${conversation.title}`}
                title="Delete chat"
              >
                <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
              </button>
            </div>
          </>
        )}
      </div>
    );
  };

  const historySidebarContent = (
    <>
      <div className="border-b border-slate-200 px-3 py-3">
          <div className="flex items-center justify-between gap-2">
          <p className="flex items-center gap-1.5 text-xs font-bold text-slate-700"><History className="h-3.5 w-3.5 text-slate-500" aria-hidden="true" /> History</p>
          <div className="flex items-center gap-1">
            <button type="button" onClick={() => setHistoryCollapsed(true)} className="hidden rounded-lg border border-slate-200 bg-white p-1.5 text-slate-500 shadow-2xs transition hover:border-[#C28B00] hover:text-slate-900 md:inline-flex" aria-label="Collapse conversation history" title="Collapse history"><PanelLeftClose className="h-3.5 w-3.5" aria-hidden="true" /></button>
            <button type="button" onClick={handleNewConversation} className="rounded-lg border border-slate-200 bg-white p-1.5 text-slate-500 shadow-2xs transition hover:border-[#C28B00] hover:text-slate-900" aria-label="New conversation" title="New conversation"><Plus className="h-3.5 w-3.5" aria-hidden="true" /></button>
            <button type="button" onClick={() => setMobileHistoryOpen(false)} className="rounded-lg border border-slate-200 bg-white p-1.5 text-slate-500 shadow-2xs transition hover:text-slate-900 md:hidden" aria-label="Close history" title="Close history"><X className="h-3.5 w-3.5" aria-hidden="true" /></button>
          </div>
        </div>
        <label className="relative mt-2.5 block">
          <span className="sr-only">Search conversations</span>
          <Search className="pointer-events-none absolute left-2.5 top-2.5 h-3.5 w-3.5 text-slate-400" aria-hidden="true" />
          <input value={historyQuery} onChange={(event) => setHistoryQuery(event.target.value)} placeholder="Search conversations..." className="w-full rounded-lg border border-slate-200 bg-white py-1.5 pl-8 pr-2.5 text-base text-slate-800 outline-none placeholder:text-slate-400 focus:border-[#C28B00] focus:ring-2 focus:ring-[#FFC107]/20 sm:text-xs" />
        </label>
      </div>
      <div className="custom-scrollbar min-h-0 flex-1 overflow-y-auto overscroll-contain px-2 py-2.5">
        {historyLoading ? <div className="flex justify-center py-6 text-slate-400"><Loader2 className="h-4 w-4 animate-spin" aria-label="Loading history" /></div> : null}
        {!historyLoading && conversations.length === 0 ? <p className="px-2 py-6 text-xs leading-5 text-slate-500">Your saved conversations will appear here.</p> : null}
        {!historyLoading && conversations.length > 0 && !Object.values(groupedConversations).some((items) => items.length) ? <p className="px-2 py-6 text-xs leading-5 text-slate-500">No conversations found.</p> : null}
        {groupedConversations.recent.length ? (
          <section>
            <p className="flex items-center gap-1.5 px-2 pb-1.5 pt-0.5 text-[10px] font-bold uppercase tracking-wider text-slate-400"><CalendarDays className="h-3 w-3" aria-hidden="true" /> Recent</p>
            <div className="space-y-1">{groupedConversations.recent.map(renderConversation)}</div>
          </section>
        ) : null}
        {groupedConversations.month.length ? (
          <section className="mt-3 border-t border-slate-200/80 pt-2.5">
            <p className="flex items-center gap-1.5 px-2 pb-1.5 text-[10px] font-bold uppercase tracking-wider text-slate-400"><CalendarDays className="h-3 w-3" aria-hidden="true" /> This Month</p>
            <div className="space-y-1">{groupedConversations.month.map(renderConversation)}</div>
          </section>
        ) : null}
        {groupedConversations.older.length ? (
          <section className="mt-3 border-t border-slate-200/80 pt-2.5">
            <button type="button" onClick={() => setOlderHistoryOpen((open) => !open)} className="flex w-full items-center justify-between px-2 pb-1.5 text-left text-[10px] font-bold uppercase tracking-wider text-slate-400 hover:text-slate-700">
              <span>Older</span><ChevronDown className={`h-3.5 w-3.5 transition-transform ${olderHistoryOpen ? 'rotate-180' : ''}`} aria-hidden="true" />
            </button>
            {olderHistoryOpen ? <div className="space-y-1">{groupedConversations.older.map(renderConversation)}</div> : null}
          </section>
        ) : null}
      </div>
      {conversations.length > 0 ? (
        <div className="shrink-0 border-t border-slate-200 bg-white/80 px-3 py-2.5">
          {confirmClearAll ? (
            <div className="flex items-center justify-between gap-2">
              <span className="truncate text-[11px] font-semibold text-red-700">Delete all chats?</span>
              <div className="flex shrink-0 items-center gap-1">
                <button
                  type="button"
                  disabled={clearingAll}
                  onClick={() => void handleClearAllHistory()}
                  className="inline-flex items-center gap-1 rounded-md bg-red-600 px-2 py-1 text-[10px] font-bold text-white transition hover:bg-red-700 disabled:opacity-60"
                >
                  {clearingAll ? <Loader2 className="h-3 w-3 animate-spin" aria-hidden="true" /> : null}
                  Clear
                </button>
                <button
                  type="button"
                  disabled={clearingAll}
                  onClick={() => setConfirmClearAll(false)}
                  className="rounded-md border border-slate-200 bg-white px-2 py-1 text-[10px] font-semibold text-slate-600 transition hover:bg-slate-100 disabled:opacity-60"
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => {
                setConfirmDeleteId(null);
                setConfirmClearAll(true);
              }}
              className="flex w-full items-center justify-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-[11px] font-semibold text-slate-600 transition hover:border-red-200 hover:bg-red-50 hover:text-red-700"
            >
              <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
              <span>Clear history</span>
            </button>
          )}
        </div>
      ) : null}
    </>
  );

  const inlinePanelStyle = isDesktopViewport && !isExpanded && panelPosition
    ? { left: `${panelPosition.left}px`, top: `${panelPosition.top}px`, right: 'auto', bottom: 'auto' }
    : undefined;

  return (
    <>
      {!isOpen ? (
        <div className="fixed bottom-5 right-5 z-40 flex items-center gap-2.5 animate-float-slow group select-none sm:bottom-6 sm:right-6">
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
        <>
          {isExpanded ? (
            <div
              className="fixed inset-0 z-40 hidden bg-slate-950/35 backdrop-blur-[2px] sm:block"
              onClick={() => setIsExpanded(false)}
              aria-hidden="true"
            />
          ) : null}

          <section
            ref={panelRef}
            style={inlinePanelStyle}
            className={`fixed inset-0 z-50 flex h-[100dvh] w-full flex-col overflow-hidden bg-white shadow-[0_24px_64px_-12px_rgba(3,8,23,0.34)] ring-1 ring-slate-900/10 ${
              isExpanded
                ? 'sm:inset-auto sm:left-1/2 sm:top-1/2 sm:h-[min(800px,calc(100dvh-2.5rem))] sm:w-[min(1100px,calc(100vw-2.5rem))] sm:-translate-x-1/2 sm:-translate-y-1/2 sm:rounded-2xl'
                : `sm:inset-auto sm:bottom-5 sm:right-5 sm:h-[min(640px,calc(100dvh-2.5rem))] sm:w-[min(680px,calc(100vw-2.5rem))] md:w-[min(780px,calc(100vw-3rem))] lg:h-[min(680px,calc(100dvh-3rem))] lg:w-[min(860px,calc(100vw-3rem))] sm:rounded-2xl ${panelPosition ? 'sm:!bottom-auto sm:!right-auto' : ''}`
            }`}
            role="dialog"
            aria-modal="true"
            aria-label="JCB Intelligence Hub chat"
          >
            <header
              className={`relative flex shrink-0 select-none items-center justify-between gap-2 overflow-hidden bg-gradient-to-r from-[#030817] via-[#071735] to-[#132746] px-3.5 py-2.5 text-white sm:px-4 sm:py-3 ${
                isDesktopViewport && !isExpanded ? 'sm:cursor-grab sm:touch-none sm:active:cursor-grabbing' : ''
              }`}
              onPointerDown={handlePanelPointerDown}
              onPointerMove={handlePanelPointerMove}
              onPointerUp={handlePanelPointerUp}
              onPointerCancel={handlePanelPointerUp}
              title={isDesktopViewport && !isExpanded ? 'Drag to move the chat window' : undefined}
            >
              <div className="pointer-events-none absolute -right-12 -top-20 h-44 w-64 rotate-[28deg] rounded-full bg-[#FFC107]/10 blur-2xl" />
              <div className="relative flex min-w-0 items-center gap-2.5 sm:gap-3">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-[#FFC107]/45 bg-[#FFC107]/12 text-[#FFC107] sm:h-10 sm:w-10">
                  <Sparkles className="h-4 w-4 sm:h-5 sm:w-5" aria-hidden="true" />
                </span>
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="truncate text-sm font-bold tracking-tight">JCB Intelligence Hub</p>
                    <span className="hidden shrink-0 items-center gap-1 rounded-full border border-emerald-300/30 bg-emerald-400/10 px-2 py-0.5 text-[10px] font-semibold text-emerald-200 sm:inline-flex">
                      <span className="h-1.5 w-1.5 rounded-full bg-emerald-300" />
                      Internal Assistant
                    </span>
                  </div>
                  <p className="truncate text-[11px] text-slate-300">Internal operations assistant · read-only guidance</p>
                </div>
              </div>
              <div className="relative flex shrink-0 items-center gap-1">
                <button
                  type="button"
                  onClick={() => setMobileHistoryOpen((open) => !open)}
                  className={`flex h-9 w-9 items-center justify-center rounded-lg transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#FFC107] md:hidden ${mobileHistoryOpen ? 'bg-white/15 text-[#FFC107]' : 'text-slate-300 hover:bg-white/10 hover:text-white'}`}
                  aria-label="Toggle conversation history"
                  aria-expanded={mobileHistoryOpen}
                  title="History"
                >
                  <History className="h-4 w-4" aria-hidden="true" />
                </button>
                <button type="button" onClick={handleNewConversation} className="flex h-9 w-9 items-center justify-center rounded-lg text-slate-300 transition hover:bg-white/10 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#FFC107]" aria-label="Start new conversation" title="New conversation">
                  <Plus className="h-4 w-4" aria-hidden="true" />
                </button>
                <button
                  type="button"
                  onClick={() => setIsExpanded((expanded) => !expanded)}
                  className="hidden h-9 w-9 items-center justify-center rounded-lg text-slate-300 transition hover:bg-white/10 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#FFC107] sm:flex"
                  aria-label={isExpanded ? 'Restore compact size' : 'Expand chat window'}
                  title={isExpanded ? 'Compact view' : 'Expand view'}
                >
                  {isExpanded ? <Minimize2 className="h-4 w-4" aria-hidden="true" /> : <Maximize2 className="h-4 w-4" aria-hidden="true" />}
                </button>
                <button
                  type="button"
                  onClick={closePanel}
                  className="flex h-9 w-9 items-center justify-center rounded-lg text-slate-300 transition hover:bg-white/10 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#FFC107]"
                  aria-label="Close JCB Intelligence Hub"
                  title="Close"
                >
                  <X className="h-4 w-4" aria-hidden="true" />
                </button>
              </div>
            </header>

            <div className="relative flex min-h-0 flex-1 overflow-hidden">
              {/* Desktop Persistent History Sidebar */}
              <aside className={`hidden shrink-0 flex-col border-r border-slate-200 bg-[#F8FAFC] transition-[width] duration-200 md:flex ${historyCollapsed ? 'w-14' : 'w-60 lg:w-64'}`}>
                {historyCollapsed ? (
                  <div className="flex h-full flex-col items-center gap-2 px-2 py-3">
                    <button type="button" onClick={() => setHistoryCollapsed(false)} className="rounded-lg border border-slate-200 bg-white p-2 text-slate-500 shadow-2xs transition hover:border-[#C28B00] hover:text-slate-900" aria-label="Expand conversation history" title="Expand history"><PanelLeftOpen className="h-4 w-4" aria-hidden="true" /></button>
                    <button type="button" onClick={handleNewConversation} className="rounded-lg border border-slate-200 bg-white p-2 text-slate-500 shadow-2xs transition hover:border-[#C28B00] hover:text-slate-900" aria-label="New conversation" title="New conversation"><Plus className="h-4 w-4" aria-hidden="true" /></button>
                  </div>
                ) : historySidebarContent}
              </aside>

              {/* Mobile & Small Tablet Slide-Over History Drawer */}
              {mobileHistoryOpen ? (
                <div className="absolute inset-0 z-20 flex md:hidden">
                  <aside className="flex h-full w-[min(280px,84%)] flex-col border-r border-slate-200 bg-[#F8FAFC] shadow-xl">
                    {historySidebarContent}
                  </aside>
                  <button
                    type="button"
                    onClick={() => setMobileHistoryOpen(false)}
                    className="flex-1 bg-slate-950/35 backdrop-blur-[1px]"
                    aria-label="Close conversation history"
                  />
                </div>
              ) : null}

              <div className="flex min-w-0 flex-1 flex-col bg-slate-50/70">
                <div className="custom-scrollbar min-h-0 flex-1 space-y-3 overflow-y-auto overscroll-contain px-3.5 py-3.5 sm:px-5 sm:py-4" aria-live="polite">
                  {messagesLoading ? <div className="flex h-full items-center justify-center text-slate-400"><Loader2 className="h-5 w-5 animate-spin" aria-label="Loading messages" /></div> : null}
                  {!messagesLoading && messages.length === 0 ? (
                    <div className="flex min-h-full flex-col items-center justify-center px-3 py-6 text-center sm:px-6">
                      <span className="flex h-12 w-12 items-center justify-center rounded-2xl border border-[#FFC107]/30 bg-[#FFC107]/15 text-[#9A6700] shadow-2xs"><Bot className="h-6 w-6" aria-hidden="true" /></span>
                      <h2 className="mt-3 text-sm font-bold text-slate-900 sm:text-base">How can I help with internal operations?</h2>
                      <p className="mt-1.5 max-w-sm text-xs leading-5 text-slate-500">Ask for a read-only summary, checklist, or operational explanation. High-risk actions still require human review.</p>
                      <div className="mt-4 flex flex-wrap justify-center gap-2">
                        {[
                          ['Summarize a setting', 'Summarize the current setting'],
                          ['Create a checklist', 'Create a checklist for this workflow'],
                          ['Explain a process', 'Explain this process step by step'],
                        ].map(([label, prompt]) => (
                          <button
                            key={label}
                            type="button"
                            onClick={() => {
                              setDraft(prompt);
                              window.setTimeout(() => textareaRef.current?.focus(), 0);
                            }}
                            className="rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 shadow-2xs transition hover:border-[#C28B00] hover:bg-amber-50/40 hover:text-slate-950 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#FFC107]"
                          >
                            {label}
                          </button>
                        ))}
                      </div>
                    </div>
                  ) : null}
                  {!messagesLoading ? messages.map((message) => (
                    <div key={message.id} className={`flex ${message.role === 'USER' ? 'justify-end' : 'justify-start'}`}>
                      <div className={`min-w-0 max-w-[92%] rounded-2xl px-3.5 py-2.5 text-sm leading-6 shadow-2xs sm:max-w-[85%] ${message.role === 'USER' ? 'rounded-br-md bg-[#061532] text-white' : 'rounded-bl-md border border-slate-200 bg-white text-slate-800'}`}>
                        {message.role === 'ASSISTANT'
                          ? <div className="prose prose-sm max-w-none break-words text-inherit [&_a]:text-[#0B5FFF] [&_pre]:overflow-x-auto [&_pre]:rounded-lg [&_pre]:bg-slate-900 [&_pre]:p-3 [&_pre]:text-slate-100 [&_table]:block [&_table]:overflow-x-auto" dangerouslySetInnerHTML={{ __html: purifyAiHtml(normalizeAiDisplayText(message.content)) }} />
                          : <p className="whitespace-pre-wrap break-words">{message.content}</p>}
                        <div className={`mt-1.5 flex items-center justify-between gap-3 text-[10px] ${message.role === 'USER' ? 'text-slate-300' : 'text-slate-400'}`}>
                          <span className="truncate">
                            {message.role === 'ASSISTANT' && (message.provider || message.modelAlias)
                              ? `${message.provider || status.provider} · ${message.modelAlias || status.model} · `
                              : null}
                            {message.role === 'ASSISTANT' && message.toolName
                              ? `${message.toolSource === 'database' ? 'Database' : 'Source'} · ${message.toolName}${message.toolFetchedAt ? ` · Fetched ${formatAiTimestamp(message.toolFetchedAt)}` : ''} · `
                              : null}
                            {formatTime(message.createdAt)}
                          </span>
                          {message.role === 'ASSISTANT' ? (
                            <button
                              type="button"
                              onClick={() => void handleCopyMessage(message.id, message.content)}
                              className="inline-flex shrink-0 items-center gap-1 rounded px-1.5 py-0.5 font-semibold text-slate-400 transition hover:bg-slate-100 hover:text-slate-700"
                              aria-label="Copy response"
                              title="Copy response"
                            >
                              {copiedMessageId === message.id ? <Check className="h-3 w-3 text-emerald-600" aria-hidden="true" /> : <Copy className="h-3 w-3" aria-hidden="true" />}
                              <span>{copiedMessageId === message.id ? 'Copied' : 'Copy'}</span>
                            </button>
                          ) : null}
                        </div>
                      </div>
                    </div>
                  )) : null}
                  {sending ? (
                    <div className="flex justify-start">
                      <div className="inline-flex items-center gap-2 rounded-2xl rounded-bl-md border border-slate-200 bg-white px-4 py-2.5 text-xs font-medium text-slate-500 shadow-2xs">
                        <Loader2 className="h-4 w-4 animate-spin text-[#C28B00]" aria-label="AI is responding" />
                        <span>Thinking…</span>
                      </div>
                    </div>
                  ) : null}
                  <div ref={messagesEndRef} />
                </div>

                {statusError ? <div className="border-t border-amber-200 bg-amber-50 px-3.5 py-2 text-xs text-amber-900 sm:px-4" role="status">{statusError}</div> : null}
                {error && !statusError ? <div className="border-t border-red-200 bg-red-50 px-3.5 py-2 text-xs text-red-800 sm:px-4" role="alert">{error}</div> : null}

                <div className="shrink-0 border-t border-slate-200 bg-white px-3 pt-2.5 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:px-4 sm:py-3">
                  <div className="mb-2 flex flex-wrap items-center justify-between gap-2 px-0.5 text-xs">
                    <div ref={modelMenuRef} className="relative flex min-w-0 items-center gap-2">
                      <span className="shrink-0 text-[11px] font-semibold text-slate-500">Model in use</span>
                      <button
                        type="button"
                        onClick={() => {
                          setModelQuery('');
                          setModelMenuOpen((open) => !open);
                        }}
                        className="inline-flex min-w-0 max-w-[min(68vw,360px)] items-center gap-1.5 rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-[11px] font-semibold text-emerald-700 transition hover:border-emerald-300 hover:bg-emerald-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#FFC107]"
                        title={`${status.provider} - ${selectedModel || status.model}`}
                        aria-haspopup="listbox"
                        aria-expanded={modelMenuOpen}
                      >
                        <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-500" />
                        <span className="truncate">{status.provider} - {selectedModel || status.model}</span>
                        <ChevronDown className={`h-3 w-3 shrink-0 transition-transform ${modelMenuOpen ? 'rotate-180' : ''}`} aria-hidden="true" />
                      </button>
                      {modelMenuOpen ? (
                        <div className="absolute bottom-full left-0 z-30 mb-2 w-[min(360px,calc(100vw-2rem))] overflow-hidden rounded-xl border border-slate-200 bg-white shadow-[0_18px_42px_rgba(15,23,42,0.18)]" role="dialog" aria-label="Choose AI model">
                          <div className="border-b border-slate-200 bg-slate-50/90 p-2.5">
                            <div className="relative">
                              <Search className="pointer-events-none absolute left-2.5 top-2.5 h-3.5 w-3.5 text-slate-400" aria-hidden="true" />
                              <input
                                autoFocus
                                value={modelQuery}
                                onChange={(event) => setModelQuery(event.target.value)}
                                placeholder="Search models..."
                                className="w-full rounded-lg border border-slate-200 bg-white py-2 pl-8 pr-2.5 text-sm text-slate-800 outline-none placeholder:text-slate-400 focus:border-[#C28B00] focus:ring-2 focus:ring-[#FFC107]/20"
                                aria-label="Search AI models"
                              />
                            </div>
                          </div>
                          <div className="custom-scrollbar max-h-56 overflow-y-auto p-1.5" role="listbox" aria-label="Available AI models">
                            {modelsLoading ? <div className="flex items-center gap-2 px-3 py-3 text-xs text-slate-500"><Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" /> Loading provider models...</div> : null}
                            {!modelsLoading && filteredModelOptions.length === 0 ? <p className="px-3 py-3 text-xs text-slate-500">No compatible models found for this provider.</p> : null}
                            {!modelsLoading ? filteredModelOptions.map((model) => (
                              <button
                                key={model.id}
                                type="button"
                                role="option"
                                aria-selected={selectedModel === model.id}
                                onClick={() => {
                                  setSelectedModel(model.id);
                                  setModelMenuOpen(false);
                                }}
                                className={`flex w-full items-center justify-between gap-3 rounded-lg px-2.5 py-2 text-left transition ${selectedModel === model.id ? 'bg-[#FFF8E1] text-slate-950' : 'text-slate-700 hover:bg-slate-50'}`}
                              >
                                <span className="min-w-0">
                                  <span className="block truncate text-xs font-semibold">{model.id}</span>
                                  <span className="mt-0.5 block truncate text-[10px] text-slate-400">{model.name} - {model.transport === 'responses' ? 'Responses' : 'Chat'}</span>
                                </span>
                                {selectedModel === model.id ? <Check className="h-4 w-4 shrink-0 text-emerald-600" aria-hidden="true" /> : null}
                              </button>
                            )) : null}
                          </div>
                          <p className="border-t border-slate-200 px-3 py-2 text-[10px] leading-4 text-slate-400">Only models returned by the configured provider are selectable.</p>
                        </div>
                      ) : null}
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        if (isSpeaking) {
                          stopSpeaking();
                          return;
                        }
                        setVoiceOutputEnabled((enabled) => !enabled);
                      }}
                      disabled={!voiceSupported && !isSpeaking}
                      className={`inline-flex shrink-0 items-center gap-1 rounded-lg border px-2 py-1 text-[10px] font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#FFC107] ${isSpeaking ? 'animate-pulse border-red-200 bg-red-50 text-red-700 hover:border-red-300 hover:text-red-800 motion-reduce:animate-none' : voiceOutputEnabled ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : 'border-slate-200 bg-white text-slate-500 hover:border-slate-300 hover:text-slate-800'} disabled:cursor-not-allowed disabled:opacity-45`}
                      aria-pressed={isSpeaking || voiceOutputEnabled}
                      aria-label={isSpeaking ? 'Stop spoken response' : voiceOutputEnabled ? 'Turn off spoken responses' : 'Turn on spoken responses'}
                      title={isSpeaking ? 'Stop speaking' : voiceSupported ? (voiceOutputEnabled ? 'Turn off spoken responses' : 'Read responses aloud') : 'Voice output is not supported in this browser'}
                    >
                      {isSpeaking ? <Square className="h-3.5 w-3.5 fill-current" aria-hidden="true" /> : voiceOutputEnabled ? <Volume2 className="h-3.5 w-3.5" aria-hidden="true" /> : <VolumeX className="h-3.5 w-3.5" aria-hidden="true" />}
                      <span className="hidden sm:inline">{getVoiceOutputButtonLabel(isSpeaking, voiceOutputEnabled)}</span>
                    </button>
                  </div>
                  <div className="hidden">
                    <span className="text-[11px] font-semibold text-slate-500">Model in use</span>
                    <span className="inline-flex max-w-full items-center gap-1.5 truncate rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-0.5 text-[11px] font-semibold text-emerald-700" title={`${status.provider} · ${status.model}`}>
                      <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-500" />
                      <span className="truncate">{status.provider} · {status.model}</span>
                    </span>
                  </div>
                  {isListening || isTranscribing ? (
                    <div id="ai-voice-input-status" className="mb-2 flex items-center gap-2 px-1 text-[10px] font-semibold text-red-700" role="status" aria-live="polite">
                      <span className="flex h-3 items-end gap-0.5" aria-hidden="true">
                        {[0, 1, 2, 3].map((bar) => (
                          <span key={bar} className={`w-0.5 rounded-full bg-red-500 motion-reduce:animate-none ${bar % 2 === 0 ? 'h-2 animate-pulse' : 'h-3 animate-bounce'}`} />
                        ))}
                      </span>
                      <span>{getVoiceInputStatusLabel(isListening, isTranscribing)}</span>
                      <span className="font-normal text-slate-400">Speak naturally; words appear in the message box.</span>
                    </div>
                  ) : null}
                  <div className={`flex items-end gap-2 rounded-xl border bg-white p-1.5 shadow-2xs transition focus-within:border-[#C28B00] focus-within:ring-2 focus-within:ring-[#FFC107]/20 sm:p-2 ${isListening ? 'border-red-300 ring-2 ring-red-100' : 'border-slate-300'}`}>
                    <label className="sr-only" htmlFor="ai-floating-chat-input">Message JCB Intelligence Hub</label>
                    <textarea
                      ref={textareaRef}
                      id="ai-floating-chat-input"
                      value={draft}
                      onChange={(event) => setDraft(event.target.value)}
                      onKeyDown={handleKeyDown}
                      rows={2}
                      maxLength={4000}
                      disabled={sending || activeConversation?.status === 'ARCHIVED'}
                      placeholder={activeConversation?.status === 'ARCHIVED' ? 'Start a new conversation to continue…' : 'Ask a read-only operations question…'}
                      aria-describedby={isListening || isTranscribing ? 'ai-voice-input-status' : undefined}
                      className="min-h-11 max-h-32 min-w-0 flex-1 resize-none overflow-y-auto border-0 bg-transparent px-1.5 py-1 text-base leading-6 text-slate-900 outline-none placeholder:text-slate-400 disabled:cursor-not-allowed disabled:bg-slate-50 sm:text-sm"
                    />
                    <div className="relative shrink-0">
                      {isListening ? <span className="absolute inset-0 animate-ping rounded-lg bg-red-200 opacity-60 motion-reduce:animate-none" aria-hidden="true" /> : null}
                      <button
                      type="button"
                      onClick={toggleVoiceInput}
                      disabled={!voiceSupported || sending || activeConversation?.status === 'ARCHIVED'}
                      className={`relative z-10 flex h-10 w-10 items-center justify-center rounded-lg border transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#FFC107] ${isListening ? 'border-red-200 bg-red-50 text-red-600' : 'border-slate-200 bg-white text-slate-500 hover:border-slate-300 hover:text-slate-900'} disabled:cursor-not-allowed disabled:opacity-45`}
                      aria-label={isListening ? 'Stop voice input' : 'Start voice input'}
                      title={voiceSupported ? (isListening ? 'Stop listening' : 'Speak your question') : 'Voice input is not supported in this browser'}
                      aria-pressed={isListening}
                      >
                        {isListening ? <MicOff className="h-4 w-4" aria-hidden="true" /> : <Mic className="h-4 w-4" aria-hidden="true" />}
                      </button>
                    </div>
                    <button
                      type="button"
                      onClick={() => void handleSend()}
                      disabled={!canSend}
                      className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-[#FFC107] text-[#111827] shadow-2xs transition hover:bg-[#f2b500] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#C28B00] disabled:cursor-not-allowed disabled:opacity-45"
                      aria-label="Send message"
                      title="Send message"
                    >
                      <Send className="h-4 w-4" aria-hidden="true" />
                    </button>
                  </div>
                  <p className="mt-1.5 px-0.5 text-[10px] leading-4 text-slate-400">
                    <span className="hidden sm:inline">Enter to send · Shift+Enter for a new line · </span>
                    Sensitive identifiers are redacted before provider access
                  </p>
                </div>
              </div>
            </div>
          </section>
        </>
      ) : null}
    </>
  );
}
