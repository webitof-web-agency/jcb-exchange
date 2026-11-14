'use client';

import Link from 'next/link';
import { isAxiosError } from 'axios';
import {
  AlertCircle,
  Archive,
  Bot,
  CalendarDays,
  Check,
  ChevronDown,
  Clipboard,
  Copy,
  History,
  Loader2,
  Mic,
  MicOff,
  PanelLeftClose,
  PanelLeftOpen,
  Plus,
  RefreshCw,
  Search,
  Send,
  Settings2,
  ShieldCheck,
  Sparkles,
  Square,
  Trash2,
  Volume2,
  VolumeX,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { toast } from 'react-toastify';
import api from '@/lib/api';
import { hasAnyPermission } from '@/lib/permissionUtils';
import { purifyAiHtml } from '@/lib/safeHtml';
import { useAuthStore } from '@/store/authStore';
import { notifyAiConversationUpdated, subscribeToAiConversationUpdates } from './aiConversationSync';
import { notifyAiModelUpdated, subscribeToAiModelUpdates } from '@/lib/aiModelSync';
import { readRememberedAiConversationId, rememberAiConversationId, selectRestoredConversationId, type RestorableConversation } from '@/lib/aiConversationState';
import { formatAiTimestamp, normalizeAiDisplayText } from './aiDisplay';
import { filterAiModelOptions, getProviderModelCatalogMessage, hasProviderModel, type AiModelOption } from './aiModelPicker';
import {
  choosePreferredSpeechVoice,
  getSpeechRecognitionConstructor,
  getVoiceInputErrorMessage,
  getVoiceInputStatusLabel,
  getVoiceOutputButtonLabel,
  joinVoiceDraft,
  stripAiVoiceMarkup,
  type SpeechRecognitionLike,
} from './aiVoice';
import {
  getAiRuntimePresentation,
  getAiToolArguments,
  normalizeAiMessage,
  type AiReadOnlyTool,
  type AiRuntimeStatus,
} from './aiCommandCenterModel';
import AiActionReviewQueue from './AiActionReviewQueue';

type AiStatusResponse = AiRuntimeStatus & { success: boolean };

type AiModelsResponse = {
  success: boolean;
  provider: string;
  selectedModel: string;
  models: AiModelOption[];
};

type AiSettingsUpdateResponse = {
  success: boolean;
  settings: {
    provider: string;
    model: string;
  };
};

type AiChatResponse = {
  success: boolean;
  conversationId?: string;
  requestId: string;
  provider: string;
  model: string;
  answer: string;
  tool?: {
    name: string;
    label: string;
    source?: string;
    fetchedAt?: string;
    automatic?: boolean;
    confidenceScore?: number;
    confidenceLabel?: string;
  };
};

type AiConversationMessage = {
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

type AiConversation = {
  id: string;
  title: string;
  status: 'ACTIVE' | 'ARCHIVED';
  lastMessageAt: string | null;
  createdAt: string;
  updatedAt: string;
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
  model: 'not configured',
  modelConfigured: false,
  keyConfigured: false,
};

const statusToneClasses = {
  success: 'border-emerald-200 bg-emerald-50 text-emerald-700',
  warning: 'border-amber-200 bg-amber-50 text-amber-800',
  neutral: 'border-slate-200 bg-slate-50 text-slate-700',
} as const;

const formatTime = (value: string | null | undefined) => {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
};

const displayTitle = (value: string) => (value.length > 28 ? `${value.slice(0, 28).trim()}…` : value);

export default function AiCommandCenter() {
  const { user } = useAuthStore();
  const userId = user?.id;
  const [status, setStatus] = useState<AiRuntimeStatus>(defaultStatus);
  const [statusError, setStatusError] = useState<string | null>(null);
  const [message, setMessage] = useState('');
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
  const [conversations, setConversations] = useState<AiConversation[]>([]);
  const [conversationMessages, setConversationMessages] = useState<AiConversationMessage[]>([]);
  const [historyQuery, setHistoryQuery] = useState('');
  const [olderHistoryOpen, setOlderHistoryOpen] = useState(false);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [messagesLoading, setMessagesLoading] = useState(false);
  const [historyError, setHistoryError] = useState<string | null>(null);
  const [historyCollapsed, setHistoryCollapsed] = useState(false);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [confirmClearHistory, setConfirmClearHistory] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [clearingHistory, setClearingHistory] = useState(false);
  const [isBriefingOpen, setIsBriefingOpen] = useState(false);
  const [isInspectorExpanded, setIsInspectorExpanded] = useState(false);
  const [sidebarTab, setSidebarTab] = useState<'tools' | 'prompts' | 'status'>('tools');
  const [copiedMessageId, setCopiedMessageId] = useState<string | null>(null);

  // Model selection state
  const [modelOptions, setModelOptions] = useState<AiModelOption[]>([]);
  const [selectedModel, setSelectedModel] = useState<string | null>(null);
  const [modelQuery, setModelQuery] = useState('');
  const [modelMenuOpen, setModelMenuOpen] = useState(false);
  const [modelsLoading, setModelsLoading] = useState(false);
  const [modelsError, setModelsError] = useState<string | null>(null);

  // Voice output state
  const [voiceOutputEnabled, setVoiceOutputEnabled] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [voiceSupported, setVoiceSupported] = useState(false);

  // Voice listening (input) state
  const [isListening, setIsListening] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);

  // Refs
  const conversationLoadRef = useRef(0);
  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const modelMenuRef = useRef<HTMLDivElement | null>(null);
  const speechUtteranceRef = useRef<SpeechSynthesisUtterance | null>(null);
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const voiceDraftPrefixRef = useRef('');
  const voiceListeningIntentRef = useRef(false);
  const voiceRestartTimerRef = useRef<number | null>(null);
  const voiceFinalSegmentsRef = useRef<Record<number, string>>({});
  const voiceInterimSegmentsRef = useRef<Record<number, string>>({});
  const voiceCommittedTextRef = useRef('');
  const voiceSessionIdRef = useRef(0);

  const isSuperadmin = user?.role === 'SUPER_ADMIN';
  const canManageSharedModel = Boolean(
    isSuperadmin
    || (user?.role === 'EMPLOYEE' && hasAnyPermission(user.permissions, ['ai.manage'])),
  );
  const presentation = useMemo(() => getAiRuntimePresentation(status), [status]);
  const normalizedMessage = normalizeAiMessage(message);
  const selectedTool = tools.find((tool) => tool.name === selectedToolName) || null;
  const activeConversation = conversations.find((conversation) => conversation.id === activeConversationId) || null;

  useEffect(() => {
    rememberAiConversationId(userId, activeConversationId);
  }, [activeConversationId, userId]);

  const groupedConversations = useMemo(() => {
    const query = historyQuery.trim().toLowerCase();
    const matching = conversations.filter((conversation) => {
      if (!query) return true;
      return `${conversation.title} ${conversation.status}`.toLowerCase().includes(query);
    });
    const getTimestamp = (conversation: AiConversation) => new Date(conversation.lastMessageAt || conversation.updatedAt || conversation.createdAt).getTime();
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

  const availableModelOptions = modelOptions;

  const filteredModelOptions = useMemo(
    () => filterAiModelOptions(availableModelOptions, modelQuery),
    [availableModelOptions, modelQuery],
  );

  const requiresToolQuery = selectedTool?.name === 'listing.search'
    || selectedTool?.name === 'listing.detail'
    || selectedTool?.name === 'vehicle.identity';
  const hasToolQueryInput = requiresToolQuery || selectedTool?.name === 'forecast.operations';
  const canSubmit = Boolean(
    status.enabled
    && normalizedMessage
    && activeConversation?.status !== 'ARCHIVED'
    && (!requiresToolQuery || toolQuery.trim())
    && !chatLoading,
  );

  // Voice speech synthesis helpers
  const stopSpeaking = useCallback(() => {
    speechUtteranceRef.current = null;
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      window.speechSynthesis.cancel();
    }
    setIsSpeaking(false);
  }, []);

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

  // Voice speech recognition helpers
  const stopVoiceInput = useCallback(() => {
    voiceListeningIntentRef.current = false;
    if (voiceRestartTimerRef.current !== null) {
      window.clearTimeout(voiceRestartTimerRef.current);
      voiceRestartTimerRef.current = null;
    }
    try {
      recognitionRef.current?.stop();
    } catch {
      // Recognition may already be ended
    }
    setIsListening(false);
    setIsTranscribing(false);
  }, []);

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

      setMessage(joinVoiceDraft(
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
      setMessage(joinVoiceDraft(voiceDraftPrefixRef.current, voiceCommittedTextRef.current, ''));

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
    voiceDraftPrefixRef.current = message.trim();
    voiceCommittedTextRef.current = '';
    voiceFinalSegmentsRef.current = {};
    voiceInterimSegmentsRef.current = {};
    setIsListening(true);
    setIsTranscribing(false);
    startVoiceRecognition(true);
  };

  // Close model menu on outside click
  useEffect(() => {
    if (!modelMenuOpen) return undefined;
    const closeOnOutsideClick = (event: globalThis.MouseEvent) => {
      if (modelMenuRef.current && !modelMenuRef.current.contains(event.target as Node)) {
        setModelMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', closeOnOutsideClick);
    return () => document.removeEventListener('mousedown', closeOnOutsideClick);
  }, [modelMenuOpen]);

  // Voice detection on mount & cleanup
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

  // Auto-scroll messages to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }, [conversationMessages, chatLoading]);

  const loadStatus = useCallback(async () => {
    setStatusError(null);
    try {
      const response = await api.get<AiStatusResponse>('/ai/status');
      setStatus({
        enabled: Boolean(response.data.enabled),
        provider: response.data.provider || 'configured provider',
        model: response.data.model || 'not configured',
        modelConfigured: Boolean(response.data.modelConfigured),
        keyConfigured: Boolean(response.data.keyConfigured),
        configurationError: response.data.configurationError || null,
      });
    } catch (error) {
      setStatusError(errorMessage(error, 'AI runtime status could not be loaded.'));
    } finally {
    }
  }, []);

  const loadModels = useCallback(async () => {
    setModelsLoading(true);
    setModelsError(null);
    try {
      const response = await api.get<AiModelsResponse>('/ai/models');
      const loadedModels = response.data?.models || [];
      setModelOptions(loadedModels);
      setModelsError(getProviderModelCatalogMessage(null, loadedModels.length));
      setSelectedModel((current) => {
        if (hasProviderModel(loadedModels, current)) return current;
        return hasProviderModel(loadedModels, response.data?.selectedModel) ? response.data.selectedModel : null;
      });
    } catch (error) {
      setModelOptions([]);
      setSelectedModel(null);
      setModelsError(getProviderModelCatalogMessage(errorMessage(error, 'Provider models could not be loaded.'), 0));
    } finally {
      setModelsLoading(false);
    }
  }, []);

  const persistModelSelection = useCallback(async (modelId: string, previousModel: string | null) => {
    if (!canManageSharedModel) {
      setSelectedModel(modelId);
      toast.info('This model is selected for the current chat. Shared default changes require AI management permission.');
      return;
    }

    setSelectedModel(modelId);
    try {
      const response = await api.put<AiSettingsUpdateResponse>('/superadmin/ai-settings', { model: modelId });
      const nextSettings = response.data.settings;
      setSelectedModel(nextSettings.model);
      setStatus((current) => ({
        ...current,
        provider: nextSettings.provider,
        model: nextSettings.model,
        modelConfigured: true,
      }));
      notifyAiModelUpdated({ provider: nextSettings.provider, model: nextSettings.model });
      toast.success('AI model updated across Settings and Intelligence Hub.');
    } catch (error) {
      setSelectedModel(previousModel);
      toast.error(errorMessage(error, 'The shared AI model could not be updated.'));
    }
  }, [canManageSharedModel]);

  useEffect(() => subscribeToAiModelUpdates((detail) => {
    setSelectedModel(detail.model);
    setStatus((current) => ({
      ...current,
      provider: detail.provider,
      model: detail.model,
      modelConfigured: true,
    }));
    void loadModels();
  }), [loadModels]);

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

  const loadConversationState = useCallback(async (requestedConversationId?: string) => {
    const loadId = conversationLoadRef.current + 1;
    conversationLoadRef.current = loadId;
    setHistoryLoading(true);
    setMessagesLoading(true);
    setHistoryError(null);
    try {
      const historyResponse = await api.get<{ success: boolean; conversations: AiConversation[] }>('/ai/history');
      const nextConversations = historyResponse.data.conversations || [];
      const restoredConversationId = selectRestoredConversationId(
        nextConversations as RestorableConversation[],
        requestedConversationId || null,
        readRememberedAiConversationId(userId),
      );
      const conversation = nextConversations.find((item) => item.id === restoredConversationId) || null;

      if (loadId !== conversationLoadRef.current) return;
      setConversations(nextConversations);
      if (!conversation) {
        setActiveConversationId(null);
        setConversationMessages([]);
        return;
      }

      setActiveConversationId(conversation.id);
      const messagesResponse = await api.get<{ success: boolean; messages: AiConversationMessage[] }>(`/ai/history/${conversation.id}/messages`);
      if (loadId !== conversationLoadRef.current) return;
      const nextMessages = messagesResponse.data.messages || [];
      setConversationMessages(nextMessages);
    } catch (error) {
      if (loadId === conversationLoadRef.current) {
        setHistoryError(errorMessage(error, 'Conversation history could not be loaded.'));
      }
    } finally {
      if (loadId === conversationLoadRef.current) {
        setHistoryLoading(false);
        setMessagesLoading(false);
      }
    }
  }, [userId]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void loadStatus();
      void loadModels();
      void loadTools();
      void loadBriefing();
      void loadConversationState();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [loadBriefing, loadConversationState, loadModels, loadStatus, loadTools]);

  useEffect(() => subscribeToAiConversationUpdates(({ conversationId, action }) => {
    void loadConversationState(action === 'deleted' || action === 'cleared' ? undefined : conversationId);
  }), [loadConversationState]);

  const handleNewConversation = () => {
    setActiveConversationId(null);
    setConversationMessages([]);
    setMessage('');
    setSelectedToolName(null);
    setToolQuery('');
    setChatError(null);
    window.setTimeout(() => textareaRef.current?.focus(), 0);
  };

  const loadConversationMessages = async (conversationId: string) => {
    setMessagesLoading(true);
    setHistoryError(null);
    setActiveConversationId(conversationId);
    try {
      const response = await api.get<{ success: boolean; messages: AiConversationMessage[] }>(`/ai/history/${conversationId}/messages`);
      const nextMessages = response.data.messages || [];
      setConversationMessages(nextMessages);
      notifyAiConversationUpdated({ conversationId });
    } catch (error) {
      const nextError = errorMessage(error, 'Conversation history could not be loaded.');
      setHistoryError(nextError);
      toast.error(nextError);
    } finally {
      setMessagesLoading(false);
    }
  };

  const handleArchiveConversation = async (conversationId: string) => {
    try {
      await api.patch(`/ai/history/${conversationId}`, { archived: true });
      setConversations((items) => items.map((item) => item.id === conversationId ? { ...item, status: 'ARCHIVED' } : item));
      if (activeConversationId === conversationId) handleNewConversation();
      notifyAiConversationUpdated({ conversationId, action: 'updated' });
      toast.success('Conversation archived.');
    } catch (error) {
      toast.error(errorMessage(error, 'Conversation could not be archived.'));
    }
  };

  const handleDeleteConversation = async (conversationId: string) => {
    if (deletingId) return;
    setDeletingId(conversationId);
    try {
      await api.delete(`/ai/history/${conversationId}`);
      setConversations((items) => items.filter((item) => item.id !== conversationId));
      setConfirmDeleteId(null);
      if (activeConversationId === conversationId) handleNewConversation();
      notifyAiConversationUpdated({ conversationId, action: 'deleted' });
      toast.success('Conversation deleted.');
    } catch (error) {
      toast.error(errorMessage(error, 'Conversation could not be deleted.'));
    } finally {
      setDeletingId(null);
    }
  };

  const handleClearHistory = async () => {
    if (clearingHistory) return;
    setClearingHistory(true);
    try {
      await api.delete('/ai/history');
      setConversations([]);
      setActiveConversationId(null);
      setConversationMessages([]);
      setConfirmDeleteId(null);
      setConfirmClearHistory(false);
      notifyAiConversationUpdated({ action: 'cleared' });
      toast.success('All chat history deleted.');
    } catch (error) {
      toast.error(errorMessage(error, 'Chat history could not be cleared.'));
    } finally {
      setClearingHistory(false);
    }
  };

  const submitMessage = async () => {
    const nextMessage = normalizeAiMessage(message);
    if (!nextMessage || !status.enabled || activeConversation?.status === 'ARCHIVED' || (requiresToolQuery && !toolQuery.trim()) || chatLoading) return;

    stopVoiceInput();
    const optimisticMessageId = `pending-${Date.now()}`;
    const optimisticMessage: AiConversationMessage = {
      id: optimisticMessageId,
      conversationId: activeConversationId || 'pending',
      role: 'USER',
      content: nextMessage,
      createdAt: new Date().toISOString(),
    };
    setConversationMessages((items) => [...items, optimisticMessage]);
    setMessage('');
    setChatLoading(true);
    setChatError(null);
    try {
      const request: {
        message: string;
        conversationId?: string;
        model?: string;
        tool?: { name: string; arguments: Record<string, unknown> };
      } = { message: nextMessage };
      if (activeConversationId) request.conversationId = activeConversationId;
      if (selectedModel) request.model = selectedModel;
      if (selectedTool) {
        request.tool = {
          name: selectedTool.name,
          arguments: getAiToolArguments(selectedTool, toolQuery),
        };
      }
      const response = await api.post<AiChatResponse>('/ai/chat', request);
      speakAiResponse(normalizeAiDisplayText(response.data.answer));
      if (response.data.conversationId) {
        setActiveConversationId(response.data.conversationId);
        notifyAiConversationUpdated({ conversationId: response.data.conversationId });
        await loadConversationState(response.data.conversationId);
      }
    } catch (error) {
      const nextError = errorMessage(error, 'The AI request could not be completed.');
      setConversationMessages((items) => items.filter((item) => item.id !== optimisticMessageId));
      setChatError(nextError);
      toast.error(nextError);
    } finally {
      setChatLoading(false);
    }
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      void submitMessage();
    }
  };

  const handleCopyMessage = async (messageId: string, content: string) => {
    try {
      const safeContent = normalizeAiDisplayText(content);
      await navigator.clipboard.writeText(safeContent.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim() || safeContent);
      setCopiedMessageId(messageId);
      window.setTimeout(() => {
        setCopiedMessageId((current) => (current === messageId ? null : current));
      }, 1800);
    } catch {
      toast.error('Response could not be copied.');
    }
  };

  const renderConversation = (conversation: AiConversation) => {
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
                onClick={() => void handleDeleteConversation(conversation.id)}
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
                  onClick={() => void handleArchiveConversation(conversation.id)}
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
                  setConfirmClearHistory(false);
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
          <p className="flex items-center gap-1.5 text-xs font-bold text-slate-700">
            <History className="h-3.5 w-3.5 text-slate-500" aria-hidden="true" /> History
          </p>
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => setHistoryCollapsed(true)}
              className="hidden rounded-lg border border-slate-200 bg-white p-1.5 text-slate-500 shadow-2xs transition hover:border-[#C28B00] hover:text-slate-900 md:inline-flex"
              aria-label="Collapse conversation history"
              title="Collapse history"
            >
              <PanelLeftClose className="h-3.5 w-3.5" aria-hidden="true" />
            </button>
            <button
              type="button"
              onClick={handleNewConversation}
              className="rounded-lg border border-slate-200 bg-white p-1.5 text-slate-500 shadow-2xs transition hover:border-[#C28B00] hover:text-slate-900"
              aria-label="New conversation"
              title="New conversation"
            >
              <Plus className="h-3.5 w-3.5" aria-hidden="true" />
            </button>
          </div>
        </div>
        <label className="relative mt-2.5 block">
          <span className="sr-only">Search conversations</span>
          <Search className="pointer-events-none absolute left-2.5 top-2.5 h-3.5 w-3.5 text-slate-400" aria-hidden="true" />
          <input
            value={historyQuery}
            onChange={(event) => setHistoryQuery(event.target.value)}
            placeholder="Search conversations..."
            className="w-full rounded-lg border border-slate-200 bg-white py-1.5 pl-8 pr-2.5 text-xs text-slate-800 outline-none placeholder:text-slate-400 focus:border-[#C28B00] focus:ring-2 focus:ring-[#FFC107]/20"
          />
        </label>
      </div>

      <div className="custom-scrollbar min-h-0 flex-1 overflow-y-auto overscroll-contain px-2 py-2.5">
        {historyLoading ? (
          <div className="flex justify-center py-6 text-slate-400">
            <Loader2 className="h-4 w-4 animate-spin" aria-label="Loading history" />
          </div>
        ) : null}
        {!historyLoading && conversations.length === 0 ? (
          <p className="px-2 py-6 text-xs leading-5 text-slate-500">Your saved conversations will appear here.</p>
        ) : null}
        {!historyLoading && conversations.length > 0 && !Object.values(groupedConversations).some((items) => items.length) ? (
          <p className="px-2 py-6 text-xs leading-5 text-slate-500">No conversations found.</p>
        ) : null}
        {groupedConversations.recent.length ? (
          <section>
            <p className="flex items-center gap-1.5 px-2 pb-1.5 pt-0.5 text-[10px] font-bold uppercase tracking-wider text-slate-400">
              <CalendarDays className="h-3 w-3" aria-hidden="true" /> Recent
            </p>
            <div className="space-y-1">{groupedConversations.recent.map(renderConversation)}</div>
          </section>
        ) : null}
        {groupedConversations.month.length ? (
          <section className="mt-3 border-t border-slate-200/80 pt-2.5">
            <p className="flex items-center gap-1.5 px-2 pb-1.5 text-[10px] font-bold uppercase tracking-wider text-slate-400">
              <CalendarDays className="h-3 w-3" aria-hidden="true" /> This Month
            </p>
            <div className="space-y-1">{groupedConversations.month.map(renderConversation)}</div>
          </section>
        ) : null}
        {groupedConversations.older.length ? (
          <section className="mt-3 border-t border-slate-200/80 pt-2.5">
            <button
              type="button"
              onClick={() => setOlderHistoryOpen((open) => !open)}
              className="flex w-full items-center justify-between px-2 pb-1.5 text-left text-[10px] font-bold uppercase tracking-wider text-slate-400 hover:text-slate-700"
            >
              <span>Older</span>
              <ChevronDown className={`h-3.5 w-3.5 transition-transform ${olderHistoryOpen ? 'rotate-180' : ''}`} aria-hidden="true" />
            </button>
            {olderHistoryOpen ? <div className="space-y-1">{groupedConversations.older.map(renderConversation)}</div> : null}
          </section>
        ) : null}
      </div>

      {conversations.length > 0 ? (
        <div className="shrink-0 border-t border-slate-200 bg-white/80 px-3 py-2.5">
          {confirmClearHistory ? (
            <div className="flex items-center justify-between gap-2">
              <span className="truncate text-[11px] font-semibold text-red-700">Delete all chats?</span>
              <div className="flex shrink-0 items-center gap-1">
                <button
                  type="button"
                  disabled={clearingHistory}
                  onClick={() => void handleClearHistory()}
                  className="inline-flex items-center gap-1 rounded-md bg-red-600 px-2 py-1 text-[10px] font-bold text-white transition hover:bg-red-700 disabled:opacity-60"
                >
                  {clearingHistory ? <Loader2 className="h-3 w-3 animate-spin" aria-hidden="true" /> : null}
                  Clear
                </button>
                <button
                  type="button"
                  disabled={clearingHistory}
                  onClick={() => setConfirmClearHistory(false)}
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
                setConfirmClearHistory(true);
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

  return (
    <main className="min-h-full bg-slate-100/70 px-3 py-3 sm:px-5 sm:py-4 lg:px-6">
      <div className="mx-auto max-w-7xl space-y-3">

        {/* 1. SLICK COMPACT COCKPIT BANNER */}
        <section className="relative overflow-hidden rounded-xl border border-slate-800 bg-gradient-to-r from-[#070F1E] via-[#0B1A33] to-[#12284C] p-3 sm:p-3.5 text-white shadow-2xs flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
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
              <p className="text-[11px] text-slate-300 truncate">
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

        {/* 2. COLLAPSIBLE DAILY BRIEFING */}
        <section className="overflow-hidden rounded-xl border border-slate-200/90 bg-white shadow-2xs transition-all" aria-live="polite">
          <div className="flex items-center justify-between px-3.5 py-2 bg-slate-50/80 border-b border-slate-100">
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
                  <p className="whitespace-pre-wrap text-xs sm:text-sm leading-relaxed text-slate-800">{briefing.briefing.content ? normalizeAiDisplayText(briefing.briefing.content) : 'The briefing is empty.'}</p>
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

        {/* 4. MAIN WORKSPACE CONTAINER - Constrained height with internal scrolling */}
        <section className="grid gap-3.5 lg:grid-cols-12 items-stretch h-[min(820px,calc(100dvh-13.5rem))] min-h-[580px]">

          {/* Left Column: Interactive Chat & Response Flow (Unified Card) */}
          <div className="lg:col-span-8 flex h-full flex-col overflow-hidden rounded-xl border border-slate-200/90 bg-white shadow-2xs min-w-0">
            {/* Header bar */}
            <div className="flex shrink-0 items-center justify-between gap-2 border-b border-slate-200 bg-[#F8FAFC] px-3.5 py-2.5">
              <div className="flex min-w-0 items-center gap-2">
                <History className="h-4 w-4 shrink-0 text-slate-500" aria-hidden="true" />
                <div className="min-w-0">
                  <h2 className="truncate text-xs font-bold text-slate-900">Conversation history</h2>
                  <p className="hidden text-[10px] text-slate-500 sm:block">Saved per operator and shared with the floating assistant.</p>
                </div>
              </div>
              <div className="flex shrink-0 items-center gap-1.5">
                <button
                  type="button"
                  onClick={handleNewConversation}
                  className="inline-flex h-7 items-center gap-1 rounded-lg border border-slate-200 bg-white px-2 text-[11px] font-semibold text-slate-600 transition hover:border-[#C28B00] hover:text-slate-900"
                  aria-label="Start new conversation"
                >
                  <Plus className="h-3.5 w-3.5" aria-hidden="true" /> <span className="hidden sm:inline">New</span>
                </button>
                <button
                  type="button"
                  onClick={() => setHistoryCollapsed((collapsed) => !collapsed)}
                  className="hidden h-7 w-7 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-500 transition hover:border-[#C28B00] hover:text-slate-900 md:inline-flex"
                  aria-label={historyCollapsed ? 'Expand conversation history' : 'Collapse conversation history'}
                  title={historyCollapsed ? 'Expand history' : 'Collapse history'}
                >
                  {historyCollapsed ? <PanelLeftOpen className="h-3.5 w-3.5" aria-hidden="true" /> : <PanelLeftClose className="h-3.5 w-3.5" aria-hidden="true" />}
                </button>
              </div>
            </div>

            {historyError ? (
              <div className="shrink-0 border-b border-red-200 bg-red-50 px-3.5 py-2 text-xs text-red-800" role="alert">{historyError}</div>
            ) : null}

            {/* Main content grid: History sidebar on left, Chat & bottom input on right */}
            <div className={`grid min-h-0 flex-1 grid-rows-[auto_minmax(0,1fr)] md:grid-rows-1 ${historyCollapsed ? 'md:grid-cols-[56px_minmax(0,1fr)]' : 'md:grid-cols-[minmax(190px,240px)_minmax(0,1fr)]'}`}>
              <aside className={`flex flex-col border-b border-slate-200 bg-[#F8FAFC] md:border-b-0 md:border-r overflow-hidden ${historyCollapsed ? 'md:w-14' : ''}`}>
                {historyCollapsed ? (
                  <div className="hidden h-full flex-col items-center gap-2 p-2 md:flex">
                    <button type="button" onClick={() => setHistoryCollapsed(false)} className="rounded-lg border border-slate-200 bg-white p-2 text-slate-500 hover:text-slate-900" aria-label="Expand history"><PanelLeftOpen className="h-4 w-4" /></button>
                    <button type="button" onClick={handleNewConversation} className="rounded-lg border border-slate-200 bg-white p-2 text-slate-500 hover:text-slate-900" aria-label="New conversation"><Plus className="h-4 w-4" /></button>
                  </div>
                ) : historySidebarContent}
              </aside>

              {/* Chat Column: Internal scroll messages at top, Pinned input at bottom */}
              <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden bg-slate-50/70">
                {/* Messages scroll area */}
                <div className="custom-scrollbar min-h-0 flex-1 space-y-3 overflow-y-auto overscroll-contain px-3.5 py-3.5 sm:px-5 sm:py-4" aria-live="polite">
                  {messagesLoading ? (
                    <div className="flex h-full min-h-[220px] items-center justify-center text-slate-400">
                      <Loader2 className="h-5 w-5 animate-spin" aria-label="Loading messages" />
                    </div>
                  ) : null}

                  {!messagesLoading && conversationMessages.length === 0 ? (
                    <div className="flex min-h-full flex-col items-center justify-center px-3 py-6 text-center">
                      <span className="flex h-12 w-12 items-center justify-center rounded-2xl border border-[#FFC107]/30 bg-[#FFC107]/15 text-[#9A6700] shadow-2xs">
                        <Bot className="h-6 w-6" aria-hidden="true" />
                      </span>
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
                              setMessage(prompt);
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

                  {!messagesLoading ? conversationMessages.map((conversationMessage) => (
                    <div key={conversationMessage.id} className={`flex ${conversationMessage.role === 'USER' ? 'justify-end' : 'justify-start'}`}>
                      <div className={`min-w-0 max-w-[92%] rounded-2xl px-3.5 py-2.5 text-sm leading-6 shadow-2xs sm:max-w-[85%] ${conversationMessage.role === 'USER' ? 'rounded-br-md bg-[#061532] text-white' : 'rounded-bl-md border border-slate-200 bg-white text-slate-800'}`}>
                        {conversationMessage.role === 'ASSISTANT'
                          ? <div className="prose prose-sm max-w-none break-words text-inherit [&_a]:text-[#0B5FFF] [&_pre]:overflow-x-auto [&_pre]:rounded-lg [&_pre]:bg-slate-900 [&_pre]:p-3 [&_pre]:text-slate-100 [&_table]:block [&_table]:overflow-x-auto" dangerouslySetInnerHTML={{ __html: purifyAiHtml(normalizeAiDisplayText(conversationMessage.content)) }} />
                          : <p className="whitespace-pre-wrap break-words">{normalizeAiDisplayText(conversationMessage.content)}</p>}
                        <div className={`mt-1.5 flex items-center justify-between gap-3 text-[10px] ${conversationMessage.role === 'USER' ? 'text-slate-300' : 'text-slate-400'}`}>
                          <span className="truncate">
                            {conversationMessage.role === 'ASSISTANT' && (conversationMessage.provider || conversationMessage.modelAlias)
                              ? `${conversationMessage.provider || status.provider} · ${conversationMessage.modelAlias || status.model} · `
                              : null}
                            {conversationMessage.role === 'ASSISTANT' && conversationMessage.toolName
                              ? `${conversationMessage.toolSource === 'database' ? 'Database' : 'Source'} · ${conversationMessage.toolName}${conversationMessage.toolFetchedAt ? ` · Fetched ${formatAiTimestamp(conversationMessage.toolFetchedAt)}` : ''} · `
                              : null}
                            {formatTime(conversationMessage.createdAt)}
                          </span>
                          {conversationMessage.role === 'ASSISTANT' ? (
                            <button
                              type="button"
                              onClick={() => void handleCopyMessage(conversationMessage.id, conversationMessage.content)}
                              className="inline-flex shrink-0 items-center gap-1 rounded px-1.5 py-0.5 font-semibold text-slate-400 transition hover:bg-slate-100 hover:text-slate-700"
                              aria-label="Copy response"
                              title="Copy response"
                            >
                              {copiedMessageId === conversationMessage.id ? <Check className="h-3 w-3 text-emerald-600" aria-hidden="true" /> : <Copy className="h-3 w-3" aria-hidden="true" />}
                              <span>{copiedMessageId === conversationMessage.id ? 'Copied' : 'Copy'}</span>
                            </button>
                          ) : null}
                        </div>
                      </div>
                    </div>
                  )) : null}

                  {chatLoading ? (
                    <div className="flex justify-start">
                      <div className="inline-flex items-center gap-2 rounded-2xl rounded-bl-md border border-slate-200 bg-white px-4 py-2.5 text-xs font-medium text-slate-500 shadow-2xs">
                        <Loader2 className="h-4 w-4 animate-spin text-[#C28B00]" aria-label="AI is responding" />
                        <span>Thinking…</span>
                      </div>
                    </div>
                  ) : null}

                  <div ref={messagesEndRef} />
                </div>

                {chatError ? (
                  <div className="shrink-0 border-t border-red-200 bg-red-50 px-3.5 py-2 text-xs text-red-800" role="alert">{chatError}</div>
                ) : null}

                {/* Bottom Pinned Prompt & Input Area */}
                <div className="shrink-0 border-t border-slate-200 bg-white px-3 pt-2.5 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:px-4 sm:py-3">
                  {/* Quick suggestion chips */}
                  <div className="mb-2 flex items-center gap-1.5 overflow-x-auto pb-1 text-[11px] no-scrollbar">
                    <span className="text-[10px] font-bold text-slate-400 uppercase shrink-0">Quick Ask:</span>
                    {QUICK_PROMPTS.map((quickPrompt, idx) => (
                      <button
                        key={idx}
                        type="button"
                        disabled={!status.enabled || chatLoading || activeConversation?.status === 'ARCHIVED'}
                        onClick={() => {
                          setMessage(quickPrompt);
                          window.setTimeout(() => textareaRef.current?.focus(), 0);
                        }}
                        className="shrink-0 rounded-md border border-slate-200 bg-slate-50 px-2 py-0.5 text-[10px] font-medium text-slate-700 hover:border-[#C28B00] hover:bg-amber-50 hover:text-amber-900 transition disabled:opacity-50"
                      >
                        ⚡ {quickPrompt.length > 32 ? `${quickPrompt.slice(0, 32)}…` : quickPrompt}
                      </button>
                    ))}
                  </div>

                  {/* Selected Tool Pill Banner */}
                  {selectedTool && (
                    <div className="mb-2 flex items-center justify-between rounded-lg bg-amber-50/80 border border-amber-200/80 px-3 py-1 text-xs">
                      <div className="flex items-center gap-1.5 min-w-0">
                        <ShieldCheck className="h-3.5 w-3.5 text-amber-700 shrink-0" />
                        <span className="font-bold text-amber-950 truncate text-[11px]">Active Tool: {selectedTool.label}</span>
                      </div>
                      <button
                        type="button"
                        onClick={() => { setSelectedToolName(null); setToolQuery(''); }}
                        className="text-[10px] font-semibold text-amber-900 underline hover:text-black shrink-0"
                      >
                        Clear Tool
                      </button>
                    </div>
                  )}

                  {/* Tool search query input if tool requires query */}
                  {hasToolQueryInput && (
                    <div className="mb-2">
                      <input
                        id="ai-tool-query"
                        value={toolQuery}
                        onChange={(event) => setToolQuery(event.target.value.slice(0, 100))}
                        maxLength={100}
                        placeholder={selectedTool?.name === 'forecast.operations'
                          ? 'Forecast Metric (e.g. sales, inventory, finance)'
                          : selectedTool?.name === 'vehicle.identity' ? 'Vehicle Number (e.g. CG04NF0268)' : 'Search Term (e.g. JCB 3DX Raipur)'}
                        className="h-8 w-full rounded-lg border border-slate-300 px-3 text-xs text-slate-900 outline-none focus:border-[#C28B00] focus:ring-2 focus:ring-[#FFC107]/20"
                        disabled={!status.enabled || chatLoading}
                      />
                    </div>
                  )}

                  {/* Model Selector & Voice Output Toolbar Row */}
                  <div className="mb-2 flex flex-wrap items-center justify-between gap-2 px-0.5 text-xs">
                    {/* Model in use dropdown */}
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
                                className="w-full rounded-lg border border-slate-200 bg-white py-1.5 pl-8 pr-2.5 text-xs text-slate-800 outline-none placeholder:text-slate-400 focus:border-[#C28B00] focus:ring-2 focus:ring-[#FFC107]/20"
                                aria-label="Search AI models"
                              />
                            </div>
                          </div>
                          <div className="custom-scrollbar max-h-52 overflow-y-auto p-1.5" role="listbox" aria-label="Available AI models">
                            {modelsLoading ? <div className="flex items-center gap-2 px-3 py-3 text-xs text-slate-500"><Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" /> Loading provider models...</div> : null}
                            {!modelsLoading && filteredModelOptions.length === 0 ? <p className="px-3 py-3 text-xs text-slate-500">No compatible models found for this provider.</p> : null}
                            {!modelsLoading ? filteredModelOptions.map((model) => (
                              <button
                                key={model.id}
                                type="button"
                                role="option"
                                aria-selected={selectedModel === model.id}
                                onClick={() => {
                                  setModelMenuOpen(false);
                                  void persistModelSelection(model.id, selectedModel);
                                }}
                                className={`flex w-full items-center justify-between gap-3 rounded-lg px-2.5 py-1.5 text-left transition ${selectedModel === model.id ? 'bg-[#FFF8E1] text-slate-950 font-semibold' : 'text-slate-700 hover:bg-slate-50'}`}
                              >
                                <span className="min-w-0">
                                  <span className="block truncate text-xs">{model.id}</span>
                                  <span className="mt-0.5 block truncate text-[10px] text-slate-400">{model.name} - {model.transport === 'responses' ? 'Responses' : 'Chat'}</span>
                                </span>
                                {selectedModel === model.id ? <Check className="h-4 w-4 shrink-0 text-emerald-600" aria-hidden="true" /> : null}
                              </button>
                            )) : null}
                          </div>
                          {modelsError ? <p className="border-t border-amber-200 bg-amber-50 px-3 py-2 text-[10px] leading-4 text-amber-800" role="status">{modelsError}</p> : null}
                          <p className="border-t border-slate-200 px-3 py-1.5 text-[10px] leading-4 text-slate-400">Only models returned by the configured provider are selectable.</p>
                        </div>
                      ) : null}
                    </div>

                    {/* Voice output toggle button */}
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

                  {/* Voice listening status banner */}
                  {isListening || isTranscribing ? (
                    <div id="ai-command-voice-status" className="mb-2 flex items-center gap-2 px-1 text-[10px] font-semibold text-red-700" role="status" aria-live="polite">
                      <span className="flex h-3 items-end gap-0.5" aria-hidden="true">
                        {[0, 1, 2, 3].map((bar) => (
                          <span key={bar} className={`w-0.5 rounded-full bg-red-500 motion-reduce:animate-none ${bar % 2 === 0 ? 'h-2 animate-pulse' : 'h-3 animate-bounce'}`} />
                        ))}
                      </span>
                      <span>{getVoiceInputStatusLabel(isListening, isTranscribing)}</span>
                      <span className="font-normal text-slate-400">Speak naturally; words appear in the message box.</span>
                    </div>
                  ) : null}

                  {/* Textarea + Mic + Send */}
                  <div className={`flex items-end gap-2 rounded-xl border bg-white p-1.5 shadow-2xs transition focus-within:border-[#C28B00] focus-within:ring-2 focus-within:ring-[#FFC107]/20 sm:p-2 ${isListening ? 'border-red-300 ring-2 ring-red-100' : 'border-slate-300'}`}>
                    <label className="sr-only" htmlFor="ai-command-input">Message JCB Intelligence Hub</label>
                    <textarea
                      ref={textareaRef}
                      id="ai-command-input"
                      value={message}
                      onChange={(event) => setMessage(event.target.value.slice(0, 4_000))}
                      onKeyDown={handleKeyDown}
                      rows={2}
                      maxLength={4_000}
                      disabled={chatLoading || activeConversation?.status === 'ARCHIVED'}
                      placeholder={activeConversation?.status === 'ARCHIVED' ? 'Start a new conversation to continue…' : 'Ask a read-only operations question…'}
                      aria-describedby={isListening || isTranscribing ? 'ai-command-voice-status' : undefined}
                      className="min-h-11 max-h-32 min-w-0 flex-1 resize-none overflow-y-auto border-0 bg-transparent px-1.5 py-1 text-base leading-6 text-slate-900 outline-none placeholder:text-slate-400 disabled:cursor-not-allowed disabled:bg-slate-50 sm:text-sm"
                    />

                    <div className="relative shrink-0">
                      {isListening ? <span className="absolute inset-0 animate-ping rounded-lg bg-red-200 opacity-60 motion-reduce:animate-none" aria-hidden="true" /> : null}
                      <button
                        type="button"
                        onClick={toggleVoiceInput}
                        disabled={!voiceSupported || chatLoading || activeConversation?.status === 'ARCHIVED'}
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
                      onClick={() => void submitMessage()}
                      disabled={!canSubmit}
                      className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-[#FFC107] text-[#111827] shadow-2xs transition hover:bg-[#f2b500] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#C28B00] disabled:cursor-not-allowed disabled:opacity-45"
                      aria-label="Send message"
                      title="Send message"
                    >
                      {chatLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                    </button>
                  </div>

                  <p className="mt-1.5 px-0.5 text-[10px] leading-4 text-slate-400">
                    <span className="hidden sm:inline">Enter to send · Shift+Enter for a new line · </span>
                    Sensitive identifiers are redacted before provider access
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* Right Column: Tabbed Inspector Widget (Matching Height) */}
          <aside className="lg:col-span-4 flex h-full flex-col overflow-hidden rounded-xl border border-slate-200/90 bg-white shadow-2xs min-w-0">
            <div className="shrink-0 flex items-center justify-between border-b border-slate-100 bg-white px-3.5 py-2">
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

            {/* Tab Header Navigation */}
            <div className="shrink-0 flex border-b border-slate-100 bg-slate-50 text-[11px] font-bold text-slate-500">
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

            {/* Scrollable Tab Content */}
            <div id="ai-inspector-content" className="custom-scrollbar min-h-0 flex-1 overflow-y-auto overscroll-contain">
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
                          if ((tool.name === 'listing.search' || tool.name === 'listing.detail' || tool.name === 'vehicle.identity') && !message) {
                            setMessage('Summarize the matching listings and their current availability.');
                          }
                          if (tool.name === 'forecast.operations' && !toolQuery) setToolQuery('sales');
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
                      <span className="max-w-[11rem] truncate font-bold text-slate-800">{status.modelConfigured ? (selectedModel || status.model) : 'Not configured'}</span>
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
