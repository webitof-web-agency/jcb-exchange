export type AiConversationSyncDetail = {
  conversationId: string;
  eventId?: string;
};

export const AI_CONVERSATION_SYNC_EVENT = 'jcb-intelligence-hub-conversation-updated';
const AI_CONVERSATION_CHANNEL = 'jcb-intelligence-hub-sync';

const canUseBrowserApis = () => typeof window !== 'undefined';

export const notifyAiConversationUpdated = (detail: AiConversationSyncDetail) => {
  if (!canUseBrowserApis()) return;
  const eventDetail = {
    ...detail,
    eventId: detail.eventId || `${Date.now()}-${Math.random().toString(36).slice(2)}`,
  };
  window.dispatchEvent(new CustomEvent<AiConversationSyncDetail>(AI_CONVERSATION_SYNC_EVENT, { detail: eventDetail }));
  if ('BroadcastChannel' in window) {
    const channel = new BroadcastChannel(AI_CONVERSATION_CHANNEL);
    channel.postMessage(eventDetail);
    channel.close();
  }
};

export const subscribeToAiConversationUpdates = (listener: (detail: AiConversationSyncDetail) => void) => {
  if (!canUseBrowserApis()) return () => undefined;

  const seenEventIds = new Set<string>();
  const deliver = (detail: AiConversationSyncDetail | undefined) => {
    if (!detail?.conversationId) return;
    if (detail.eventId) {
      if (seenEventIds.has(detail.eventId)) return;
      seenEventIds.add(detail.eventId);
      if (seenEventIds.size > 20) seenEventIds.delete(seenEventIds.values().next().value as string);
    }
    listener(detail);
  };

  const onWindowEvent = (event: Event) => {
    const detail = (event as CustomEvent<AiConversationSyncDetail>).detail;
    deliver(detail);
  };
  window.addEventListener(AI_CONVERSATION_SYNC_EVENT, onWindowEvent);

  let channel: BroadcastChannel | null = null;
  const onBroadcast = (event: MessageEvent<AiConversationSyncDetail>) => {
    deliver(event.data);
  };
  if ('BroadcastChannel' in window) {
    channel = new BroadcastChannel(AI_CONVERSATION_CHANNEL);
    channel.addEventListener('message', onBroadcast);
  }

  return () => {
    window.removeEventListener(AI_CONVERSATION_SYNC_EVENT, onWindowEvent);
    channel?.removeEventListener('message', onBroadcast);
    channel?.close();
  };
};
