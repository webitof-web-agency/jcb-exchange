import type { NextFunction, Request, Response } from 'express';
import { z } from 'zod';
import prisma from '../lib/prisma';
import { AiDisabledError } from '../utils/aiFeatureGate';
import { loadAiPermissionScope } from '../middlewares/aiAccess.middleware';
import {
  AiGatewayError,
  getAiRuntimeStatus,
  type AiRole,
} from '../services/ai/aiGateway.service';
import { aiGatewayService } from '../services/ai/aiGatewayInstance';
import { AiProviderError } from '../services/ai/aiProvider.service';
import { AiToolError, aiReadOnlyToolsService, type AiToolContext } from '../services/ai/aiReadOnlyTools.service';
import { getCachedDailyBriefing } from '../jobs/aiDailyBriefing.job';
import { getBriefingDateKey, AI_DAILY_BRIEFING_TIMEZONE } from '../services/ai/aiDailyBriefing.service';
import { AiConversationError, aiConversationService } from '../services/ai/aiConversation.service';

const aiToolCallSchema = z.object({
  name: z.string().trim().min(1).max(80),
  arguments: z.record(z.string(), z.unknown()).optional(),
}).strict();
const aiChatBodySchema = z.object({
  message: z.string().trim().min(1).max(4000),
  tool: aiToolCallSchema.optional(),
  conversationId: z.string().trim().min(1).max(160).optional(),
}).strict();

const aiConversationCreateBodySchema = z.object({
  title: z.string().trim().min(1).max(160).optional(),
}).strict();

const aiConversationUpdateBodySchema = z.object({
  title: z.string().trim().min(1).max(160).optional(),
  archived: z.boolean().optional(),
}).strict().refine((value) => value.title !== undefined || value.archived !== undefined, {
  message: 'A title or archive decision is required.',
});

export { aiGatewayService } from '../services/ai/aiGatewayInstance';

const sendAiError = (error: unknown, res: Response, next: NextFunction) => {
  if (error instanceof AiDisabledError || error instanceof AiGatewayError || error instanceof AiProviderError || error instanceof AiToolError || error instanceof AiConversationError) {
    return res.status(error.statusCode).json({ success: false, error: error.message, code: error.code });
  }
  return next(error);
};

const aiContextFor = async (req: Request): Promise<AiToolContext> => {
  if (!req.user || !['SUPER_ADMIN', 'ADMIN', 'EMPLOYEE'].includes(req.user.role)) {
    throw new AiToolError('AI access is restricted to internal operators.', 403, 'AI_ACCESS_FORBIDDEN');
  }
  const permissions = req.user.role === 'SUPER_ADMIN' || req.user.role === 'ADMIN'
    ? ['ALL_ACCESS']
    : await loadAiPermissionScope(req.user.id);
  return { userId: req.user.id, role: req.user.role as AiRole, permissions };
};

export const getAiStatus = async (_req: Request, res: Response, next: NextFunction) => {
  try {
    return res.json({ success: true, ...(await getAiRuntimeStatus()) });
  } catch (error) {
    return next(error);
  }
};

export const getAiTools = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const context = await aiContextFor(req);
    return res.json({ success: true, tools: aiReadOnlyToolsService.listTools(context) });
  } catch (error) {
    return sendAiError(error, res, next);
  }
};

/** Cache-only read. This endpoint never invokes the AI provider. */
export const getAiBriefing = async (req: Request, res: Response, next: NextFunction) => {
  if (!req.user) return res.status(401).json({ success: false, error: 'Authentication required.' });
  try {
    const briefing = await getCachedDailyBriefing(req.user.id);
    return res.json({
      success: true,
      timezone: AI_DAILY_BRIEFING_TIMEZONE,
      date: getBriefingDateKey(),
      briefing: briefing
        ? {
          status: briefing.status,
          content: briefing.status === 'READY' ? briefing.resultRedacted : null,
          generatedAt: briefing.generatedAt?.toISOString() ?? null,
          expiresAt: briefing.expiresAt?.toISOString() ?? null,
          updatedAt: briefing.updatedAt.toISOString(),
          nextAttemptAt: briefing.nextAttemptAt?.toISOString() ?? null,
        }
        : null,
    });
  } catch (error) {
    return next(error);
  }
};

const requireAiActor = (req: Request) => {
  if (!req.user || !['SUPER_ADMIN', 'ADMIN', 'EMPLOYEE'].includes(req.user.role)) {
    throw new AiConversationError('AI access is restricted to internal operators.', 403, 'AI_ACCESS_FORBIDDEN');
  }
  return req.user.id;
};

export const getAiConversations = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const actorUserId = requireAiActor(req);
    return res.json({ success: true, conversations: await aiConversationService.listConversations(actorUserId) });
  } catch (error) {
    return sendAiError(error, res, next);
  }
};

export const createAiConversation = async (req: Request, res: Response, next: NextFunction) => {
  const parsed = aiConversationCreateBodySchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ success: false, error: 'A valid conversation title is required.', code: 'AI_CONVERSATION_TITLE_INVALID' });
  }
  try {
    const actorUserId = requireAiActor(req);
    const conversation = await aiConversationService.createConversation(actorUserId, parsed.data.title);
    return res.status(201).json({ success: true, conversation });
  } catch (error) {
    return sendAiError(error, res, next);
  }
};

export const getAiConversationMessages = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const actorUserId = requireAiActor(req);
    const conversationId = String(req.params.conversationId || '').trim();
    const messages = await aiConversationService.getMessages(actorUserId, conversationId);
    return res.json({ success: true, messages });
  } catch (error) {
    return sendAiError(error, res, next);
  }
};

export const updateAiConversation = async (req: Request, res: Response, next: NextFunction) => {
  const parsed = aiConversationUpdateBodySchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ success: false, error: 'A valid conversation update is required.', code: 'AI_CONVERSATION_UPDATE_INVALID' });
  }
  try {
    const actorUserId = requireAiActor(req);
    const conversationId = String(req.params.conversationId || '').trim();
    if (parsed.data.title !== undefined) {
      await aiConversationService.renameConversation(actorUserId, conversationId, parsed.data.title);
    }
    if (parsed.data.archived === true) {
      await aiConversationService.archiveConversation(actorUserId, conversationId);
    }
    return res.json({ success: true, conversation: { id: conversationId, ...(parsed.data.title ? { title: parsed.data.title } : {}), ...(parsed.data.archived === true ? { status: 'ARCHIVED' } : {}) } });
  } catch (error) {
    return sendAiError(error, res, next);
  }
};

export const chatWithAi = async (req: Request, res: Response, next: NextFunction) => {
  const parsed = aiChatBodySchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ success: false, error: 'A valid AI message is required.', code: 'AI_MESSAGE_INVALID' });
  }
  if (!req.user || !['SUPER_ADMIN', 'ADMIN', 'EMPLOYEE'].includes(req.user.role)) {
    return res.status(403).json({ success: false, error: 'AI access is restricted to internal operators.', code: 'AI_ACCESS_FORBIDDEN' });
  }

  try {
    const conversationId = parsed.data.conversationId
      ? parsed.data.conversationId
      : (await aiConversationService.createConversation(req.user.id, parsed.data.message.slice(0, 160))).id;
    await aiConversationService.appendMessage(req.user.id, conversationId, {
      role: 'USER',
      content: parsed.data.message,
    });
    const context = await aiContextFor(req);
    const toolResult = parsed.data.tool
      ? await aiReadOnlyToolsService.execute(context, parsed.data.tool)
      : null;
    const result = await aiGatewayService.chat({
      userId: req.user.id,
      role: req.user.role as AiRole,
      message: parsed.data.message,
      ...(toolResult ? { toolContext: { toolName: toolResult.toolName, label: toolResult.label, data: toolResult.data } } : {}),
    });
    await aiConversationService.appendMessage(req.user.id, conversationId, {
      role: 'ASSISTANT',
      content: result.answer,
      requestId: result.requestId,
      provider: result.provider,
      modelAlias: result.model,
      ...(toolResult ? { toolName: toolResult.toolName } : {}),
    });
    return res.json({
      success: true,
      conversationId,
      ...(toolResult ? { tool: { name: toolResult.toolName, label: toolResult.label } } : {}),
      ...result,
    });
  } catch (error) {
    return sendAiError(error, res, next);
  }
};
