export type RestorableConversation = {
  id: string;
  status: 'ACTIVE' | 'ARCHIVED';
  lastMessageAt: string | null;
  updatedAt: string;
  createdAt: string;
};

const getActivityTimestamp = (conversation: RestorableConversation) => {
  const timestamp = new Date(conversation.lastMessageAt || conversation.updatedAt || conversation.createdAt).getTime();
  return Number.isFinite(timestamp) ? timestamp : 0;
};

export const selectRestoredConversationId = (
  conversations: RestorableConversation[],
  currentId: string | null,
  rememberedId: string | null,
) => {
  const conversationIds = new Set(conversations.map((conversation) => conversation.id));
  if (currentId && conversationIds.has(currentId)) return currentId;
  if (rememberedId && conversationIds.has(rememberedId)) return rememberedId;

  return [...conversations]
    .filter((conversation) => conversation.status === 'ACTIVE')
    .sort((left, right) => getActivityTimestamp(right) - getActivityTimestamp(left))[0]?.id
    || [...conversations].sort((left, right) => getActivityTimestamp(right) - getActivityTimestamp(left))[0]?.id
    || null;
};

export const getAiLastConversationStorageKey = (userId: string) => `jcb-ai-last-conversation:${userId}`;

export const readRememberedAiConversationId = (userId?: string | null) => {
  if (!userId || typeof window === 'undefined') return null;
  try {
    return window.localStorage.getItem(getAiLastConversationStorageKey(userId));
  } catch {
    return null;
  }
};

export const rememberAiConversationId = (userId: string | null | undefined, conversationId: string | null) => {
  if (!userId || !conversationId || typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(getAiLastConversationStorageKey(userId), conversationId);
  } catch {
    // Conversation restoration is best effort when browser storage is unavailable.
  }
};
