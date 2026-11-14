import { randomUUID } from 'node:crypto';
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
import { AiSettingsError, getAvailableAiModels } from '../services/ai/aiSettings.service';
import { AiToolError, aiReadOnlyToolsService, type AiToolContext } from '../services/ai/aiReadOnlyTools.service';
import { greetingResponseFor, isAiGreeting, resolveAiMessage, type AiIntentContextMessage } from '../services/ai/aiIntentRouter.service';
import { getCachedDailyBriefing } from '../jobs/aiDailyBriefing.job';
import { getBriefingDateKey, AI_DAILY_BRIEFING_TIMEZONE } from '../services/ai/aiDailyBriefing.service';
import { AiConversationError, aiConversationService } from '../services/ai/aiConversation.service';
import { AiMemoryError, aiMemoryService } from '../services/ai/aiMemory.service';
import { aiFeedbackLearningService } from '../services/ai/aiFeedbackLearning.service';
import { aiDatabaseService } from '../services/ai/aiDatabase.service';
import { aiSyncService } from '../services/ai/aiSync.service';
import { aiToolObservabilityService } from '../services/ai/aiToolObservability.service';
import { createAiDataErrorContractForCode } from '../services/ai/aiDataContract.service';
import { aiReliabilityObservabilityService, moduleForAiTool } from '../services/ai/aiReliabilityObservability.service';
import { redactSensitiveData } from '../services/ai/aiRedaction';
import { analyzeDocumentImage, type AiDocumentType } from '../services/ai/aiDocumentVision.service';

const aiDocumentAssistSchema = z.object({
  documentType: z.enum(['RC', 'PAN', 'GST', 'FINANCE']),
}).strict();

const aiToolCallSchema = z.object({
  name: z.string().trim().min(1).max(80),
  arguments: z.record(z.string(), z.unknown()).optional(),
}).strict();
const aiChatBodySchema = z.object({
  message: z.string().trim().min(1).max(4000),
  model: z.string().trim().min(1).max(100).optional(),
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

const aiObservabilityQuerySchema = z.object({
  days: z.coerce.number().int().min(1).max(90).default(7),
  limit: z.coerce.number().int().min(1).max(100).default(25),
  toolName: z.string().trim().min(1).max(100).optional(),
}).strict();

const aiFeedbackBodySchema = z.object({
  runId: z.string().trim().min(1).max(160),
  rating: z.number().int().min(1).max(5),
  comment: z.string().trim().max(2000).optional(),
}).strict();

export { aiGatewayService } from '../services/ai/aiGatewayInstance';

const sendAiError = (error: unknown, res: Response, next: NextFunction) => {
  if (error instanceof AiDisabledError || error instanceof AiGatewayError || error instanceof AiProviderError || error instanceof AiSettingsError || error instanceof AiToolError || error instanceof AiConversationError || error instanceof AiMemoryError) {
    const code = error.code;
    const contract = error instanceof AiToolError || error instanceof AiGatewayError
      ? error.contract
      : createAiDataErrorContractForCode(code, {
        ...(code.startsWith('AI_PROVIDER_') || error instanceof AiDisabledError ? { source: 'provider' as const } : {}),
      });
    return res.status(error.statusCode).json({
      success: false,
      error: error.message,
      code: error.code,
      contract,
    });
  }
  return next(error);
};

export const getAiModels = async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const runtime = await getAiRuntimeStatus();
    const models = await getAvailableAiModels(runtime.provider);
    return res.json({
      success: true,
      provider: runtime.provider,
      selectedModel: runtime.model,
      models,
    });
  } catch (error) {
    return sendAiError(error, res, next);
  }
};

export const assistAiDocument = async (req: Request, res: Response, next: NextFunction) => {
  const parsed = aiDocumentAssistSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({
      success: false,
      error: 'A valid documentType (RC, PAN, GST, or FINANCE) is required.',
      code: 'AI_DOCUMENT_TYPE_INVALID',
    });
  }
  if (!req.file) {
    return res.status(400).json({
      success: false,
      error: 'A document image is required.',
      code: 'AI_DOCUMENT_IMAGE_REQUIRED',
    });
  }
  try {
    const analysis = await analyzeDocumentImage({
      buffer: req.file.buffer,
      mimeType: req.file.mimetype,
      documentType: parsed.data.documentType as AiDocumentType,
    });
    return res.status(200).json({ success: true, analysis });
  } catch (error) {
    return next(error);
  }
};

const forecastMetadataFor = (value: unknown) => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  if (typeof record.confidenceScore !== 'number') return null;
  return {
    confidenceScore: Math.min(100, Math.max(0, Math.round(record.confidenceScore))),
    ...(typeof record.confidenceLabel === 'string' ? { confidenceLabel: record.confidenceLabel } : {}),
  };
};

const recordAiReliability = async (event: Parameters<typeof aiReliabilityObservabilityService.record>[0]) => {
  try {
    await aiReliabilityObservabilityService.record(event);
  } catch {
    // Reliability telemetry is best-effort and must never block the operator response.
  }
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

export const getAiObservability = async (req: Request, res: Response, next: NextFunction) => {
  const parsed = aiObservabilityQuerySchema.safeParse(req.query);
  if (!parsed.success) {
    return res.status(400).json({
      success: false,
      error: 'Invalid AI observability filters.',
      code: 'AI_OBSERVABILITY_QUERY_INVALID',
      contract: createAiDataErrorContractForCode('AI_OBSERVABILITY_QUERY_INVALID'),
    });
  }
  if (!req.user || !['SUPER_ADMIN', 'ADMIN'].includes(req.user.role)) {
    return res.status(403).json({
      success: false,
      error: 'AI observability is restricted to administrators.',
      code: 'AI_OBSERVABILITY_FORBIDDEN',
      contract: createAiDataErrorContractForCode('AI_OBSERVABILITY_FORBIDDEN'),
    });
  }
  try {
    const [snapshot, reliability] = await Promise.all([aiToolObservabilityService.getSnapshot({
      days: parsed.data.days,
      limit: parsed.data.limit,
      ...(parsed.data.toolName ? { toolName: parsed.data.toolName } : {}),
    }), aiReliabilityObservabilityService.getSnapshotSafe({
      days: parsed.data.days,
      limit: parsed.data.limit,
      ...(parsed.data.toolName ? { toolName: parsed.data.toolName } : {}),
    })]);
    return res.json({ success: true, ...snapshot, reliability });
  } catch (error) {
    return next(error);
  }
};

export const getAiSync = async (req: Request, res: Response, next: NextFunction) => {
  if (!req.user || !['SUPER_ADMIN', 'ADMIN'].includes(req.user.role)) {
    return res.status(403).json({
      success: false,
      error: 'AI sync status is restricted to administrators.',
      code: 'AI_SYNC_FORBIDDEN',
      contract: createAiDataErrorContractForCode('AI_SYNC_FORBIDDEN'),
    });
  }
  try {
    const checkpoints = await aiSyncService.status();
    return res.json({
      success: true,
      checkpoints: checkpoints.map((checkpoint) => ({
        ...checkpoint,
        lastObservedAt: checkpoint.lastObservedAt?.toISOString() ?? null,
        lastSyncedAt: checkpoint.lastSyncedAt?.toISOString() ?? null,
        updatedAt: checkpoint.updatedAt?.toISOString() ?? null,
      })),
    });
  } catch (error) {
    return next(error);
  }
};

export const postAiFeedback = async (req: Request, res: Response, next: NextFunction) => {
  const parsed = aiFeedbackBodySchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({
      success: false,
      error: 'A valid AI feedback rating is required.',
      code: 'AI_FEEDBACK_INVALID',
      contract: createAiDataErrorContractForCode('AI_FEEDBACK_INVALID'),
    });
  }
  try {
    const actorUserId = requireAiActor(req);
    const run = await prisma.aiRun.findUnique({ where: { id: parsed.data.runId }, select: { actorUserId: true } });
    if (!run) {
      return res.status(404).json({ success: false, error: 'AI run not found.', code: 'AI_FEEDBACK_RUN_NOT_FOUND', contract: createAiDataErrorContractForCode('AI_FEEDBACK_RUN_NOT_FOUND') });
    }
    if (run.actorUserId !== actorUserId) {
      return res.status(403).json({ success: false, error: 'Feedback can only be submitted for your own AI run.', code: 'AI_FEEDBACK_FORBIDDEN', contract: createAiDataErrorContractForCode('AI_FEEDBACK_FORBIDDEN') });
    }
    const feedback = await aiDatabaseService.saveFeedback({
      runId: parsed.data.runId,
      actorUserId,
      rating: parsed.data.rating,
      ...(parsed.data.comment !== undefined ? { comment: parsed.data.comment } : {}),
    });
    return res.status(201).json({ success: true, feedbackId: feedback.id });
  } catch (error) {
    return sendAiError(error, res, next);
  }
};

export const getAiMemory = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const actorUserId = requireAiActor(req);
    return res.json({ success: true, memories: await aiMemoryService.list(actorUserId) });
  } catch (error) {
    return sendAiError(error, res, next);
  }
};

export const deleteAiMemory = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const actorUserId = requireAiActor(req);
    const id = String(req.params.id || '');
    await aiMemoryService.remove(actorUserId, id);
    return res.json({ success: true, deletedId: id });
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
          content: briefing.status === 'READY' && briefing.resultRedacted
            ? redactSensitiveData(briefing.resultRedacted)
            : null,
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
    return res.status(400).json({
      success: false,
      error: 'A valid conversation title is required.',
      code: 'AI_CONVERSATION_TITLE_INVALID',
      contract: createAiDataErrorContractForCode('AI_CONVERSATION_TITLE_INVALID'),
    });
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
    return res.status(400).json({
      success: false,
      error: 'A valid conversation update is required.',
      code: 'AI_CONVERSATION_UPDATE_INVALID',
      contract: createAiDataErrorContractForCode('AI_CONVERSATION_UPDATE_INVALID'),
    });
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

export const deleteAiConversation = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const actorUserId = requireAiActor(req);
    const conversationId = String(req.params.conversationId || '').trim();
    await aiConversationService.deleteConversation(actorUserId, conversationId);
    return res.json({ success: true, deletedId: conversationId });
  } catch (error) {
    return sendAiError(error, res, next);
  }
};

export const deleteAllAiConversations = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const actorUserId = requireAiActor(req);
    const result = await aiConversationService.deleteAllConversations(actorUserId);
    return res.json({ success: true, deletedCount: result.count });
  } catch (error) {
    return sendAiError(error, res, next);
  }
};

export const chatWithAi = async (req: Request, res: Response, next: NextFunction) => {
  const parsed = aiChatBodySchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({
      success: false,
      error: 'A valid AI message is required.',
      code: 'AI_MESSAGE_INVALID',
      contract: createAiDataErrorContractForCode('AI_MESSAGE_INVALID'),
    });
  }
  if (!req.user || !['SUPER_ADMIN', 'ADMIN', 'EMPLOYEE'].includes(req.user.role)) {
    return res.status(403).json({
      success: false,
      error: 'AI access is restricted to internal operators.',
      code: 'AI_ACCESS_FORBIDDEN',
      contract: createAiDataErrorContractForCode('AI_ACCESS_FORBIDDEN'),
    });
  }

  const queryStartedAt = Date.now();
  let selectedToolName: string | undefined;
  try {
    const conversationId = parsed.data.conversationId
      ? parsed.data.conversationId
      : (await aiConversationService.createConversation(req.user.id, parsed.data.message.slice(0, 160))).id;
    const previousMessages = await aiConversationService.getMessages(req.user.id, conversationId);
    const intentContext: AiIntentContextMessage[] = previousMessages.slice(-8).map((message) => ({
      role: message.role,
      content: message.content,
      toolName: message.toolName,
    }));
    await aiConversationService.appendMessage(req.user.id, conversationId, {
      role: 'USER',
      content: parsed.data.message,
    });
    if (!parsed.data.tool && isAiGreeting(parsed.data.message)) {
      const requestId = randomUUID();
      const answer = greetingResponseFor(parsed.data.message);
      await aiConversationService.appendMessage(req.user.id, conversationId, {
        role: 'ASSISTANT',
        content: answer,
        requestId,
        provider: 'INTERNAL',
        modelAlias: 'greeting-router',
      });
      await recordAiReliability({
        actorUserId: req.user.id,
        eventType: 'QUERY',
        module: 'ai-router',
        provider: 'INTERNAL',
        status: 'SUCCEEDED',
        latencyMs: Math.max(0, Date.now() - queryStartedAt),
      });
      return res.json({
        success: true,
        conversationId,
        requestId,
        provider: 'INTERNAL',
        model: 'greeting-router',
        answer,
      });
    }
    try {
      await aiMemoryService.captureExplicitMemory(req.user.id, parsed.data.message);
    } catch {
      // Memory is optional continuity; it must never block the current answer.
    }
    let memoryContext: string[] = [];
    try {
      memoryContext = await aiMemoryService.contextFor(req.user.id);
    } catch {
      memoryContext = [];
    }
    try {
      memoryContext = [...memoryContext, ...(await aiFeedbackLearningService.contextFor(req.user.id))].slice(0, 10);
    } catch {
      // Feedback guidance is optional continuity; it must never block the current answer.
    }
    const context = await aiContextFor(req);
    const intentResolution = parsed.data.tool ? null : resolveAiMessage(parsed.data.message, intentContext);
    if (intentResolution?.kind === 'clarification') {
      const requestId = randomUUID();
      await aiConversationService.appendMessage(req.user.id, conversationId, {
        role: 'ASSISTANT',
        content: intentResolution.message,
        requestId,
        provider: 'INTERNAL',
        modelAlias: 'intent-router',
      });
      await recordAiReliability({
        actorUserId: req.user.id,
        eventType: 'QUERY',
        module: 'ai-router',
        provider: 'INTERNAL',
        status: 'SUCCEEDED',
        latencyMs: Math.max(0, Date.now() - queryStartedAt),
        clarification: true,
      });
      return res.json({
        success: true,
        conversationId,
        requestId,
        provider: 'INTERNAL',
        model: 'intent-router',
        answer: intentResolution.message,
        clarification: true,
      });
    }
    const resolvedTool = parsed.data.tool || (intentResolution?.kind === 'tool' ? intentResolution.request : null);
    selectedToolName = resolvedTool?.name;
    const toolResult = resolvedTool
      ? await aiReadOnlyToolsService.execute(context, resolvedTool)
      : null;
    const toolFetchedAt = toolResult ? toolResult.contract.fetchedAt : null;
    const toolForecast = toolResult ? forecastMetadataFor(toolResult.data) : null;
    const result = await aiGatewayService.chat({
      userId: req.user.id,
      role: req.user.role as AiRole,
      message: parsed.data.message,
      ...(parsed.data.model ? { model: parsed.data.model } : {}),
      conversationContext: previousMessages.slice(-8).map((message) => ({
        role: message.role === 'USER' ? 'user' as const : 'assistant' as const,
        content: message.content,
      })),
      memoryContext,
      ...(toolResult && toolFetchedAt
        ? {
          toolContext: {
            toolName: toolResult.toolName,
            label: toolResult.label,
            data: toolResult.contract,
          },
        }
        : {}),
    });
    await aiConversationService.appendMessage(req.user.id, conversationId, {
      role: 'ASSISTANT',
      content: result.answer,
      requestId: result.requestId,
      provider: result.provider,
      modelAlias: result.model,
      ...(toolResult && toolFetchedAt
        ? {
          toolName: toolResult.toolName,
          toolSource: toolResult.contract.source,
          toolFetchedAt: new Date(toolFetchedAt),
        }
        : {}),
    });
    await recordAiReliability({
      actorUserId: req.user.id,
      eventType: 'QUERY',
      ...(toolResult ? {
        module: moduleForAiTool(toolResult.toolName),
        toolName: toolResult.toolName,
        emptyData: toolResult.dataAvailability === 'UNAVAILABLE',
        ...(toolForecast?.confidenceScore !== undefined ? { forecastConfidence: toolForecast.confidenceScore } : {}),
      } : { module: 'ai-router' }),
      provider: result.provider,
      status: 'SUCCEEDED',
      latencyMs: Math.max(0, Date.now() - queryStartedAt),
    });
    return res.json({
      success: true,
      conversationId,
      ...(toolResult && toolFetchedAt
        ? {
          tool: {
            name: toolResult.toolName,
            label: toolResult.label,
            contract: toolResult.contract,
            source: toolResult.contract.source,
            fetchedAt: toolFetchedAt,
            automatic: !parsed.data.tool,
            dataAvailability: toolResult.dataAvailability,
            ...(toolResult.dataAvailabilityMessage ? { dataAvailabilityMessage: toolResult.dataAvailabilityMessage } : {}),
            durationMs: toolResult.durationMs,
            ...(toolForecast || {}),
            ...(toolResult.uiActions ? { uiActions: toolResult.uiActions } : {}),
          },
        }
        : {}),
      ...result,
    });
  } catch (error) {
    const providerFailure = error instanceof AiGatewayError
      && (error.code === 'AI_PROVIDER_NOT_CONFIGURED' || error.code === 'AI_CONFIGURATION_INVALID');
    await recordAiReliability({
      actorUserId: req.user.id,
      eventType: 'QUERY',
      ...(selectedToolName ? {
        module: moduleForAiTool(selectedToolName),
        toolName: selectedToolName,
      } : { module: 'ai-router' }),
      status: error instanceof AiToolError && error.code === 'AI_TOOL_PERMISSION_REQUIRED' ? 'DENIED' : 'FAILED',
      latencyMs: Math.max(0, Date.now() - queryStartedAt),
      permissionDenied: error instanceof AiToolError && error.code === 'AI_TOOL_PERMISSION_REQUIRED',
      providerFailure,
      ...(error instanceof Error && 'code' in error && typeof error.code === 'string' ? { errorCode: error.code } : {}),
    });
    return sendAiError(error, res, next);
  }
};
