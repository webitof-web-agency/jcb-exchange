import { AiMemorySource } from '@prisma/client';
import prisma from '../../lib/prisma';
import { redactSensitiveData } from './aiRedaction';
import { containsUserProvidedSystemInstruction, auditHmacHex, sha256Hex } from './aiSecurity.service';

const MAX_MEMORY_LENGTH = 1000;
const MAX_CONTEXT_ITEMS = 10;

export type AiMemoryRecord = {
  id: string;
  actorUserId: string;
  source: AiMemorySource;
  contentRedacted: string;
  createdAt: Date;
  updatedAt: Date;
  expiresAt: Date | null;
};

export type AiMemoryCreateInput = {
  actorUserId: string;
  source: AiMemorySource;
  contentRedacted: string;
  contentHash: string;
  contentHmac: string;
  expiresAt?: Date;
};

export type AiMemoryRepository = {
  create: (input: AiMemoryCreateInput) => Promise<AiMemoryRecord>;
  list: (actorUserId: string) => Promise<AiMemoryRecord[]>;
  remove: (actorUserId: string, id: string) => Promise<boolean>;
};

export class AiMemoryError extends Error {
  constructor(
    message: string,
    public readonly statusCode = 400,
    public readonly code = 'AI_MEMORY_ERROR',
  ) {
    super(message);
    this.name = 'AiMemoryError';
  }
}

const normalizedActorId = (value: string) => {
  const actorUserId = value.trim();
  if (!actorUserId) throw new AiMemoryError('A valid operator is required.', 400, 'AI_MEMORY_ACTOR_INVALID');
  return actorUserId;
};

/**
 * Only explicit memory requests are persisted. Ordinary prompts remain
 * conversation context and are never silently promoted into long-term memory.
 */
export const extractExplicitMemory = (message: string): string | null => {
  const raw = message.trim();
  if (!raw || containsUserProvidedSystemInstruction(raw)) return null;
  const match = /(?:remember|save|note|keep\s+in\s+mind|yaad\s+rakho|yaad\s+rakhna)\s*(?:that|this|ki|ke)?\s+(.+)$/iu.exec(raw);
  if (!match?.[1]) return null;
  const content = redactSensitiveData(match[1]).replace(/\s+/gu, ' ').trim().slice(0, MAX_MEMORY_LENGTH);
  return content.length >= 3 ? content : null;
};

const defaultRepository: AiMemoryRepository = {
  async create(input) {
    return prisma.aiMemory.upsert({
      where: { actorUserId_contentHash: { actorUserId: input.actorUserId, contentHash: input.contentHash } },
      update: {
        source: input.source,
        contentRedacted: input.contentRedacted,
        contentHmac: input.contentHmac,
        ...(input.expiresAt ? { expiresAt: input.expiresAt } : {}),
      },
      create: {
        actorUserId: input.actorUserId,
        source: input.source,
        contentRedacted: input.contentRedacted,
        contentHash: input.contentHash,
        contentHmac: input.contentHmac,
        ...(input.expiresAt ? { expiresAt: input.expiresAt } : {}),
      },
      select: { id: true, actorUserId: true, source: true, contentRedacted: true, createdAt: true, updatedAt: true, expiresAt: true },
    });
  },

  async list(actorUserId) {
    return prisma.aiMemory.findMany({
      where: {
        actorUserId,
        OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
      },
      orderBy: { updatedAt: 'desc' },
      take: MAX_CONTEXT_ITEMS,
      select: { id: true, actorUserId: true, source: true, contentRedacted: true, createdAt: true, updatedAt: true, expiresAt: true },
    });
  },

  async remove(actorUserId, id) {
    const result = await prisma.aiMemory.deleteMany({ where: { id, actorUserId } });
    return result.count === 1;
  },
};

export class AiMemoryService {
  constructor(private readonly repository: AiMemoryRepository = defaultRepository) {}

  async remember(actorUserId: string, message: string, source: AiMemorySource = AiMemorySource.EXPLICIT_OPERATOR) {
    const contentRedacted = extractExplicitMemory(message) || redactSensitiveData(message).replace(/\s+/gu, ' ').trim();
    if (!contentRedacted || contentRedacted.length > MAX_MEMORY_LENGTH) {
      throw new AiMemoryError('Memory must contain 3 to 1,000 safe characters.', 400, 'AI_MEMORY_CONTENT_INVALID');
    }
    const actor = normalizedActorId(actorUserId);
    return this.repository.create({
      actorUserId: actor,
      source,
      contentRedacted,
      contentHash: sha256Hex(contentRedacted),
      contentHmac: auditHmacHex(contentRedacted),
    });
  }

  async captureExplicitMemory(actorUserId: string, message: string) {
    if (!extractExplicitMemory(message)) return null;
    return this.remember(actorUserId, message, AiMemorySource.EXPLICIT_OPERATOR);
  }

  async list(actorUserId: string) {
    return this.repository.list(normalizedActorId(actorUserId));
  }

  async contextFor(actorUserId: string) {
    const records = await this.list(actorUserId);
    return records.map((record) => record.contentRedacted).slice(0, MAX_CONTEXT_ITEMS);
  }

  async remove(actorUserId: string, id: string) {
    const normalizedId = id.trim();
    if (!normalizedId) throw new AiMemoryError('A valid memory is required.', 400, 'AI_MEMORY_IDENTIFIER_INVALID');
    const removed = await this.repository.remove(normalizedActorId(actorUserId), normalizedId);
    if (!removed) throw new AiMemoryError('Memory not found.', 404, 'AI_MEMORY_NOT_FOUND');
  }
}

export const aiMemoryService = new AiMemoryService();
