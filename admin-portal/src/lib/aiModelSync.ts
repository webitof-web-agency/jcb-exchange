export type AiModelSyncDetail = {
  provider: string;
  model: string;
  eventId?: string;
};

export const AI_MODEL_SYNC_EVENT = 'jcb-intelligence-hub-model-updated';
const AI_MODEL_SYNC_CHANNEL = 'jcb-intelligence-hub-model-sync';

export const normalizeAiModelSyncDetail = (value: unknown): Omit<AiModelSyncDetail, 'eventId'> | null => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  const provider = typeof record.provider === 'string' ? record.provider.trim() : '';
  const model = typeof record.model === 'string' ? record.model.trim() : '';
  if (!provider || !model) return null;
  return { provider, model };
};

const canUseBrowserApis = () => typeof window !== 'undefined';

export const notifyAiModelUpdated = (detail: Omit<AiModelSyncDetail, 'eventId'>) => {
  if (!canUseBrowserApis()) return;
  const normalized = normalizeAiModelSyncDetail(detail);
  if (!normalized) return;
  const eventDetail: AiModelSyncDetail = {
    ...normalized,
    eventId: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
  };
  window.dispatchEvent(new CustomEvent<AiModelSyncDetail>(AI_MODEL_SYNC_EVENT, { detail: eventDetail }));
  if ('BroadcastChannel' in window) {
    const channel = new BroadcastChannel(AI_MODEL_SYNC_CHANNEL);
    channel.postMessage(eventDetail);
    channel.close();
  }
};

export const subscribeToAiModelUpdates = (listener: (detail: AiModelSyncDetail) => void) => {
  if (!canUseBrowserApis()) return () => undefined;

  const seenEventIds = new Set<string>();
  const deliver = (value: unknown) => {
    const normalized = normalizeAiModelSyncDetail(value);
    if (!normalized) return;
    const detail = value as AiModelSyncDetail;
    if (detail.eventId) {
      if (seenEventIds.has(detail.eventId)) return;
      seenEventIds.add(detail.eventId);
      if (seenEventIds.size > 20) seenEventIds.delete(seenEventIds.values().next().value as string);
    }
    listener({ ...normalized, ...(detail.eventId ? { eventId: detail.eventId } : {}) });
  };

  const onWindowEvent = (event: Event) => {
    deliver((event as CustomEvent<AiModelSyncDetail>).detail);
  };
  window.addEventListener(AI_MODEL_SYNC_EVENT, onWindowEvent);

  let channel: BroadcastChannel | null = null;
  const onBroadcast = (event: MessageEvent<AiModelSyncDetail>) => deliver(event.data);
  if ('BroadcastChannel' in window) {
    channel = new BroadcastChannel(AI_MODEL_SYNC_CHANNEL);
    channel.addEventListener('message', onBroadcast);
  }

  return () => {
    window.removeEventListener(AI_MODEL_SYNC_EVENT, onWindowEvent);
    channel?.removeEventListener('message', onBroadcast);
    channel?.close();
  };
};
