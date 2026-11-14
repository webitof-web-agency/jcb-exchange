import prisma from '../../lib/prisma';
import { redactSensitiveData } from './aiRedaction';
import { auditHmacHex, sha256Hex } from './aiSecurity.service';

export type AiConversationMessageRole = 'USER' | 'ASSISTANT';
export type AiConversationToolSource = string;

export type AiConversationRecord = {
  id: string;
  title: string;
  status: 'ACTIVE' | 'ARCHIVED';
  lastMessageAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

export type AiConversationMessageRecord = {
  id: string;
  conversationId: string;
  role: AiConversationMessageRole;
  content: string;
  requestId: string | null;
  provider: string | null;
  modelAlias: string | null;
  toolName: string | null;
  toolSource: AiConversationToolSource | null;
  toolFetchedAt: Date | null;
  createdAt: Date;
};

type ConversationOwnership = {
  id: string;
  actorUserId: string;
};

export type AiConversationRepository = {
  createConversation: (input: { actorUserId: string; title: string }) => Promise<{ id: string }>;
  listConversations: (actorUserId: string) => Promise<AiConversationRecord[]>;
  findConversation: (id: string) => Promise<ConversationOwnership | null>;
  listMessages: (conversationId: string) => Promise<AiConversationMessageRecord[]>;
  renameConversation: (input: { id: string; title: string }) => Promise<{ id: string }>;
  archiveConversation: (input: { id: string }) => Promise<{ id: string }>;
  deleteConversation: (input: { id: string }) => Promise<{ id: string }>;
  deleteAllConversations: (actorUserId: string) => Promise<{ count: number }>;
  appendMessage: (input: {
    conversationId: string;
    role: AiConversationMessageRole;
    contentRedacted: string;
    contentHash: string;
    contentHmac: string;
    requestId?: string;
    provider?: string;
    modelAlias?: string;
    toolName?: string;
    toolSource?: AiConversationToolSource;
    toolFetchedAt?: Date;
  }) => Promise<{ id: string }>;
};

export class AiConversationError extends Error {
  constructor(
    message: string,
    public readonly statusCode: number,
    public readonly code: string,
  ) {
    super(message);
    this.name = 'AiConversationError';
  }
}

const defaultTitle = 'New conversation';

const validateActorId = (actorUserId: string) => {
  if (!actorUserId?.trim()) {
    throw new AiConversationError('A valid operator is required.', 400, 'AI_CONVERSATION_IDENTIFIER_INVALID');
  }
};

const normalizeTitle = (title: string | undefined): string => {
  if (title === undefined) return defaultTitle;
  const value = redactSensitiveData(title).replace(/\s+/gu, ' ').trim();
  if (!value || value.length > 160) {
    throw new AiConversationError('Conversation title must contain 1 to 160 characters.', 400, 'AI_CONVERSATION_TITLE_INVALID');
  }
  return value;
};

const normalizeContent = (content: string): string => {
  const value = redactSensitiveData(content).trim();
  if (!value || value.length > 16_000) {
    throw new AiConversationError('Conversation message must contain 1 to 16,000 characters.', 400, 'AI_CONVERSATION_CONTENT_INVALID');
  }
  return value;
};

const ensureMessageRole = (role: string): AiConversationMessageRole => {
  if (role !== 'USER' && role !== 'ASSISTANT') {
    throw new AiConversationError('Only user and assistant messages can be stored.', 400, 'AI_CONVERSATION_ROLE_INVALID');
  }
  return role;
};

const createPrismaRepository = (): AiConversationRepository => ({
  async createConversation(input) {
    const conversation = await prisma.aiConversation.create({
      data: {
        actorUserId: input.actorUserId,
        title: input.title,
      },
      select: { id: true },
    });
    return conversation;
  },

  async listConversations(actorUserId) {
    return prisma.aiConversation.findMany({
      where: { actorUserId },
      orderBy: [{ status: 'asc' }, { updatedAt: 'desc' }],
      select: {
        id: true,
        title: true,
        status: true,
        lastMessageAt: true,
        createdAt: true,
        updatedAt: true,
      },
    });
  },

  async findConversation(id) {
    return prisma.aiConversation.findUnique({
      where: { id },
      select: { id: true, actorUserId: true },
    });
  },

  async listMessages(conversationId) {
    const messages = await prisma.aiConversationMessage.findMany({
      where: { conversationId },
      orderBy: { createdAt: 'asc' },
      select: {
        id: true,
        conversationId: true,
        role: true,
        contentRedacted: true,
        requestId: true,
        provider: true,
        modelAlias: true,
        toolName: true,
        toolSource: true,
        toolFetchedAt: true,
        createdAt: true,
      },
    });
    return messages.map((message) => ({
      ...message,
      role: message.role as AiConversationMessageRole,
      content: message.contentRedacted,
    }));
  },

  async renameConversation(input) {
    return prisma.aiConversation.update({
      where: { id: input.id },
      data: { title: input.title },
      select: { id: true },
    });
  },

  async archiveConversation(input) {
    return prisma.aiConversation.update({
      where: { id: input.id },
      data: { status: 'ARCHIVED' },
      select: { id: true },
    });
  },

  async deleteConversation(input) {
    return prisma.aiConversation.delete({
      where: { id: input.id },
      select: { id: true },
    });
  },

  async deleteAllConversations(actorUserId) {
    return prisma.aiConversation.deleteMany({
      where: { actorUserId },
    });
  },

  async appendMessage(input) {
    return prisma.$transaction(async (transaction) => {
      const message = await transaction.aiConversationMessage.create({
        data: {
          conversationId: input.conversationId,
          role: input.role,
          contentRedacted: input.contentRedacted,
          contentHash: input.contentHash,
          contentHmac: input.contentHmac,
          ...(input.requestId ? { requestId: input.requestId } : {}),
          ...(input.provider ? { provider: input.provider } : {}),
          ...(input.modelAlias ? { modelAlias: input.modelAlias } : {}),
          ...(input.toolName ? { toolName: input.toolName } : {}),
          ...(input.toolSource ? { toolSource: input.toolSource } : {}),
          ...(input.toolFetchedAt ? { toolFetchedAt: input.toolFetchedAt } : {}),
        },
        select: { id: true, createdAt: true },
      });
      await transaction.aiConversation.update({
        where: { id: input.conversationId },
        data: { lastMessageAt: message.createdAt },
      });
      return { id: message.id };
    });
  },
});

export class AiConversationService {
  constructor(private readonly repository: AiConversationRepository = createPrismaRepository()) {}

  async createConversation(actorUserId: string, title?: string) {
    validateActorId(actorUserId);
    return this.repository.createConversation({
      actorUserId,
      title: normalizeTitle(title),
    });
  }

  async listConversations(actorUserId: string) {
    validateActorId(actorUserId);
    const conversations = await this.repository.listConversations(actorUserId);
    return conversations.map((conversation) => ({
      ...conversation,
      title: redactSensitiveData(conversation.title),
    }));
  }

  async getMessages(actorUserId: string, conversationId: string) {
    await this.ensureOwnership(actorUserId, conversationId);
    const messages = await this.repository.listMessages(conversationId);
    return messages.map((message) => ({
      ...message,
      content: redactSensitiveData(message.content),
    }));
  }

  async renameConversation(actorUserId: string, conversationId: string, title: string) {
    await this.ensureOwnership(actorUserId, conversationId);
    return this.repository.renameConversation({ id: conversationId, title: normalizeTitle(title) });
  }

  async archiveConversation(actorUserId: string, conversationId: string) {
    await this.ensureOwnership(actorUserId, conversationId);
    return this.repository.archiveConversation({ id: conversationId });
  }

  async deleteConversation(actorUserId: string, conversationId: string) {
    await this.ensureOwnership(actorUserId, conversationId);
    return this.repository.deleteConversation({ id: conversationId });
  }

  async deleteAllConversations(actorUserId: string) {
    validateActorId(actorUserId);
    return this.repository.deleteAllConversations(actorUserId);
  }

  async appendMessage(actorUserId: string, conversationId: string, input: {
    role: string;
    content: string;
    requestId?: string;
    provider?: string;
    modelAlias?: string;
    toolName?: string;
    toolSource?: AiConversationToolSource;
    toolFetchedAt?: Date;
  }) {
    await this.ensureOwnership(actorUserId, conversationId);
    const role = ensureMessageRole(input.role);
    const contentRedacted = normalizeContent(input.content);
    return this.repository.appendMessage({
      conversationId,
      role,
      contentRedacted,
      contentHash: sha256Hex(contentRedacted),
      contentHmac: auditHmacHex(contentRedacted),
      ...(input.requestId ? { requestId: input.requestId } : {}),
      ...(input.provider ? { provider: input.provider } : {}),
      ...(input.modelAlias ? { modelAlias: input.modelAlias } : {}),
      ...(input.toolName ? { toolName: input.toolName } : {}),
      ...(input.toolSource ? { toolSource: input.toolSource } : {}),
      ...(input.toolFetchedAt ? { toolFetchedAt: input.toolFetchedAt } : {}),
    });
  }

  private async ensureOwnership(actorUserId: string, conversationId: string) {
    validateActorId(actorUserId);
    if (!conversationId?.trim()) {
      throw new AiConversationError('A valid conversation is required.', 400, 'AI_CONVERSATION_IDENTIFIER_INVALID');
    }
    const conversation = await this.repository.findConversation(conversationId);
    if (!conversation) {
      throw new AiConversationError('Conversation not found.', 404, 'AI_CONVERSATION_NOT_FOUND');
    }
    if (conversation.actorUserId !== actorUserId) {
      throw new AiConversationError('Conversation access is restricted to its owner.', 403, 'AI_CONVERSATION_FORBIDDEN');
    }
    return conversation;
  }
}

export const aiConversationService = new AiConversationService();
