import prisma from '../../lib/prisma';
import { AiGatewayService, type AiAuditEntry } from './aiGateway.service';

const writeAiAudit = async (entry: AiAuditEntry): Promise<void> => {
  const afterJson = {
    requestId: entry.requestId,
    provider: entry.provider,
    model: entry.model,
    promptHash: entry.promptHash,
    promptHmac: entry.promptHmac,
    ...(entry.responseHash ? { responseHash: entry.responseHash } : {}),
    ...(entry.responseHmac ? { responseHmac: entry.responseHmac } : {}),
    status: entry.status,
    durationMs: entry.durationMs,
    inputChars: entry.inputChars,
    outputWords: entry.outputWords,
    ...(entry.inputTokens !== undefined ? { inputTokens: entry.inputTokens } : {}),
    ...(entry.outputTokens !== undefined ? { outputTokens: entry.outputTokens } : {}),
    ...(entry.errorCode ? { errorCode: entry.errorCode } : {}),
  };

  await prisma.auditLog.create({
    data: {
      actorUserId: entry.userId,
      entityType: 'USER',
      entityId: entry.userId,
      action: 'AI_CHAT',
      afterJson,
    },
  });
};

export const aiGatewayService = new AiGatewayService({ auditWriter: writeAiAudit });
