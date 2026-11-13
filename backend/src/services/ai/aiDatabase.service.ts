import {
  AiApprovalDecision,
  AiBriefingStatus,
  AiRunStatus,
  AiToolCallStatus,
} from '@prisma/client';
import prisma from '../../lib/prisma';
import { redactSensitiveData } from './aiRedaction';
import { auditHmacHex, sha256Hex } from './aiSecurity.service';

const HASH_PATTERN = /^[a-f0-9]{64}$/iu;
const IDENTIFIER_PATTERN = /^[a-zA-Z0-9][a-zA-Z0-9._:-]*$/u;
const MAX_IDENTIFIER_LENGTH = 160;
const MAX_COMMENT_LENGTH = 2000;
const MAX_BRIEFING_LENGTH = 100_000;

type RecordRef = { id: string };

export type AiRunCreateRecord = {
  requestId: string;
  actorUserId: string;
  feature: string;
  provider: string;
  modelAlias: string;
  promptHash: string;
  promptHmac?: string;
};

export type AiRunCompleteRecord = {
  runId: string;
  responseHash: string;
  responseHmac?: string;
  outputChars: number;
  outputWords: number;
  inputTokens?: number;
  outputTokens?: number;
  latencyMs?: number;
};

export type AiRunFailureRecord = {
  runId: string;
  errorCode: string;
  latencyMs?: number;
};

export type AiToolCallRecord = {
  runId: string;
  toolName: string;
  permission: string;
  argumentsHash?: string;
  argumentsHmac?: string;
  resultHash?: string;
  resultHmac?: string;
  targetType?: string;
  targetRefHash?: string;
  inputItemCount?: number;
  outputItemCount?: number;
  durationMs?: number;
  dataAvailability?: 'AVAILABLE' | 'UNAVAILABLE';
  errorCode?: string;
};

export type AiFeedbackRecord = {
  runId: string;
  actorUserId: string;
  rating: number;
  commentRedacted?: string;
  commentHash?: string;
  commentHmac?: string;
};

export type AiBudgetUsageRecord = {
  actorUserId: string;
  usageDate: Date;
  feature: string;
  requestCount: number;
  inputTokens: number;
  outputTokens: number;
  costMicros: bigint;
};

export type AiActionProposalRecord = {
  runId: string;
  requestedById: string;
  actionType: string;
  targetType: string;
  targetRef: string;
  payloadHash: string;
  payloadHmac?: string;
  expiresAt: Date;
};

export type AiApprovalRecord = {
  proposalId: string;
  approverUserId: string;
  decision: AiApprovalDecision;
  reasonRedacted?: string;
  reasonHash?: string;
};

export type AiDailyBriefingRecord = {
  scopeKey: string;
  briefingDate: Date;
  status: AiBriefingStatus;
  modelAlias: string;
  sourceSnapshotHash?: string;
  resultRedacted?: string;
  resultHash?: string;
  errorCode?: string;
  generatedAt?: Date;
  expiresAt?: Date;
};

export type AiDatabaseRepository = {
  createRun: (record: AiRunCreateRecord) => Promise<RecordRef>;
  completeRun: (record: AiRunCompleteRecord) => Promise<void>;
  failRun: (record: AiRunFailureRecord) => Promise<void>;
  createToolCall: (record: AiToolCallRecord) => Promise<RecordRef>;
  upsertFeedback: (record: AiFeedbackRecord) => Promise<RecordRef>;
  upsertBudgetUsage: (record: AiBudgetUsageRecord) => Promise<RecordRef>;
  createActionProposal: (record: AiActionProposalRecord) => Promise<RecordRef>;
  createApproval: (record: AiApprovalRecord) => Promise<RecordRef>;
  upsertDailyBriefing: (record: AiDailyBriefingRecord) => Promise<RecordRef>;
};

export class AiDatabaseError extends Error {
  constructor(
    message: string,
    public readonly code: string = 'AI_DATABASE_ERROR',
    public readonly statusCode = 400,
  ) {
    super(message);
    this.name = 'AiDatabaseError';
  }
}

const hashValue = sha256Hex;
const hmacValue = auditHmacHex;
const hmacColumnsEnabled = () => process.env.AI_SECURITY_HMAC_COLUMNS_ENABLED?.trim().toLowerCase() === 'true';

const requiredIdentifier = (value: string, field: string): string => {
  const normalized = value.trim();
  if (!normalized || normalized.length > MAX_IDENTIFIER_LENGTH || !IDENTIFIER_PATTERN.test(normalized)) {
    throw new AiDatabaseError(`${field} contains invalid characters or is too long.`, 'AI_DATABASE_IDENTIFIER_INVALID');
  }
  return normalized;
};

const optionalIdentifier = (value: string | undefined, field: string): string | undefined => (
  value === undefined ? undefined : requiredIdentifier(value, field)
);

const requiredHash = (value: string, field: string): string => {
  if (!HASH_PATTERN.test(value)) {
    throw new AiDatabaseError(`${field} must be a SHA-256 hash.`, 'AI_DATABASE_HASH_INVALID');
  }
  return value.toLowerCase();
};

const optionalHash = (value: string | undefined, field: string): string | undefined => (
  value === undefined ? undefined : requiredHash(value, field)
);

const nonNegativeInteger = (value: number | undefined, field: string, defaultValue = 0): number => {
  const normalized = value ?? defaultValue;
  if (!Number.isSafeInteger(normalized) || normalized < 0) {
    throw new AiDatabaseError(`${field} must be a non-negative integer.`, 'AI_DATABASE_COUNTER_INVALID');
  }
  return normalized;
};

const nonNegativeBigInt = (value: bigint | undefined, field: string, defaultValue = 0n): bigint => {
  const normalized = value ?? defaultValue;
  if (normalized < 0n) {
    throw new AiDatabaseError(`${field} must be non-negative.`, 'AI_DATABASE_COUNTER_INVALID');
  }
  return normalized;
};

const requiredDate = (value: Date, field: string): Date => {
  if (!(value instanceof Date) || Number.isNaN(value.getTime())) {
    throw new AiDatabaseError(`${field} must be a valid date.`, 'AI_DATABASE_DATE_INVALID');
  }
  return value;
};

const utcDateOnly = (value: Date): Date => {
  const date = requiredDate(value, 'usageDate');
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
};

const redactedText = (value: string | undefined, maxLength: number): string | undefined => {
  if (value === undefined) return undefined;
  const redacted = redactSensitiveData(value.trim()).slice(0, maxLength);
  return redacted || undefined;
};

const redactedHash = (value: string | undefined, maxLength: number): { text?: string; hash?: string; hmac?: string } => {
  const text = redactedText(value, maxLength);
  return text ? { text, hash: hashValue(text), hmac: hmacValue(text) } : {};
};

const defaultRepository: AiDatabaseRepository = {
  createRun: async (record) => prisma.aiRun.create({
    data: {
      requestId: record.requestId,
      actorUserId: record.actorUserId,
      feature: record.feature,
      provider: record.provider,
      modelAlias: record.modelAlias,
      promptHash: record.promptHash,
      ...(hmacColumnsEnabled() && record.promptHmac ? { promptHmac: record.promptHmac } : {}),
      status: AiRunStatus.RUNNING,
    },
    select: { id: true },
  }),
  completeRun: async (record) => {
    await prisma.aiRun.update({
      where: { id: record.runId },
      data: {
        status: AiRunStatus.SUCCEEDED,
        responseHash: record.responseHash,
        ...(hmacColumnsEnabled() && record.responseHmac ? { responseHmac: record.responseHmac } : {}),
        outputChars: record.outputChars,
        outputWords: record.outputWords,
        ...(record.inputTokens !== undefined ? { inputTokens: record.inputTokens } : {}),
        ...(record.outputTokens !== undefined ? { outputTokens: record.outputTokens } : {}),
        ...(record.latencyMs !== undefined ? { latencyMs: record.latencyMs } : {}),
        completedAt: new Date(),
      },
    });
  },
  failRun: async (record) => {
    await prisma.aiRun.update({
      where: { id: record.runId },
      data: {
        status: AiRunStatus.FAILED,
        errorCode: record.errorCode,
        ...(record.latencyMs !== undefined ? { latencyMs: record.latencyMs } : {}),
        completedAt: new Date(),
      },
    });
  },
  createToolCall: async (record) => prisma.aiToolCall.create({
    data: {
      runId: record.runId,
      toolName: record.toolName,
      permission: record.permission,
      status: record.errorCode ? AiToolCallStatus.FAILED : AiToolCallStatus.SUCCEEDED,
      ...(record.argumentsHash ? { argumentsHash: record.argumentsHash } : {}),
      ...(hmacColumnsEnabled() && record.argumentsHmac ? { argumentsHmac: record.argumentsHmac } : {}),
      ...(record.resultHash ? { resultHash: record.resultHash } : {}),
      ...(hmacColumnsEnabled() && record.resultHmac ? { resultHmac: record.resultHmac } : {}),
      ...(record.targetType ? { targetType: record.targetType } : {}),
      ...(record.targetRefHash ? { targetRefHash: record.targetRefHash } : {}),
      ...(record.inputItemCount !== undefined ? { inputItemCount: record.inputItemCount } : {}),
      ...(record.outputItemCount !== undefined ? { outputItemCount: record.outputItemCount } : {}),
      ...(record.durationMs !== undefined ? { durationMs: record.durationMs } : {}),
      ...(record.dataAvailability ? { dataAvailability: record.dataAvailability } : {}),
      ...(record.errorCode ? { errorCode: record.errorCode } : {}),
      completedAt: new Date(),
    },
    select: { id: true },
  }),
  upsertFeedback: async (record) => prisma.aiFeedback.upsert({
    where: { runId_actorUserId: { runId: record.runId, actorUserId: record.actorUserId } },
    update: {
      rating: record.rating,
      ...(record.commentRedacted !== undefined ? { commentRedacted: record.commentRedacted } : {}),
      ...(record.commentHash !== undefined ? { commentHash: record.commentHash } : {}),
      ...(hmacColumnsEnabled() && record.commentHmac !== undefined ? { commentHmac: record.commentHmac } : {}),
    },
    create: {
      runId: record.runId,
      actorUserId: record.actorUserId,
      rating: record.rating,
      ...(record.commentRedacted !== undefined ? { commentRedacted: record.commentRedacted } : {}),
      ...(record.commentHash !== undefined ? { commentHash: record.commentHash } : {}),
    },
    select: { id: true },
  }),
  upsertBudgetUsage: async (record) => prisma.aiBudgetUsage.upsert({
    where: {
      actorUserId_usageDate_feature: {
        actorUserId: record.actorUserId,
        usageDate: record.usageDate,
        feature: record.feature,
      },
    },
    update: {
      requestCount: { increment: record.requestCount },
      inputTokens: { increment: record.inputTokens },
      outputTokens: { increment: record.outputTokens },
      costMicros: { increment: record.costMicros },
    },
    create: record,
    select: { id: true },
  }),
  createActionProposal: async (record) => {
    const { payloadHmac, ...legacyRecord } = record;
    return prisma.aiActionProposal.create({
    data: {
      ...legacyRecord,
      ...(hmacColumnsEnabled() && payloadHmac ? { payloadHmac } : {}),
    },
    select: { id: true },
    });
  },
  createApproval: async (record) => prisma.aiApproval.create({
    data: record,
    select: { id: true },
  }),
  upsertDailyBriefing: async (record) => prisma.aiDailyBriefing.upsert({
    where: { scopeKey_briefingDate: { scopeKey: record.scopeKey, briefingDate: record.briefingDate } },
    update: {
      status: record.status,
      modelAlias: record.modelAlias,
      ...(record.sourceSnapshotHash !== undefined ? { sourceSnapshotHash: record.sourceSnapshotHash } : {}),
      ...(record.resultRedacted !== undefined ? { resultRedacted: record.resultRedacted } : {}),
      ...(record.resultHash !== undefined ? { resultHash: record.resultHash } : {}),
      ...(record.errorCode !== undefined ? { errorCode: record.errorCode } : {}),
      ...(record.generatedAt !== undefined ? { generatedAt: record.generatedAt } : {}),
      ...(record.expiresAt !== undefined ? { expiresAt: record.expiresAt } : {}),
    },
    create: record,
    select: { id: true },
  }),
};

export class AiDatabaseService {
  constructor(private readonly repository: AiDatabaseRepository = defaultRepository) {}

  async startRun(input: AiRunCreateRecord): Promise<RecordRef> {
    return this.repository.createRun({
      requestId: requiredIdentifier(input.requestId, 'requestId'),
      actorUserId: requiredIdentifier(input.actorUserId, 'actorUserId'),
      feature: requiredIdentifier(input.feature, 'feature'),
      provider: requiredIdentifier(input.provider, 'provider'),
      modelAlias: requiredIdentifier(input.modelAlias, 'modelAlias'),
      promptHash: requiredHash(input.promptHash, 'promptHash'),
      ...(input.promptHmac !== undefined ? { promptHmac: requiredHash(input.promptHmac, 'promptHmac') } : {}),
    });
  }

  async completeRun(runId: string, input: {
    responseText: string;
    outputWords: number;
    inputTokens?: number;
    outputTokens?: number;
    latencyMs?: number;
  }): Promise<void> {
    const response = input.responseText.trim();
    if (!response) throw new AiDatabaseError('AI response cannot be empty.', 'AI_DATABASE_RESPONSE_INVALID');
    return this.repository.completeRun({
      runId: requiredIdentifier(runId, 'runId'),
      responseHash: hashValue(response),
      responseHmac: hmacValue(response),
      outputChars: response.length,
      outputWords: nonNegativeInteger(input.outputWords, 'outputWords'),
      ...(input.inputTokens !== undefined ? { inputTokens: nonNegativeInteger(input.inputTokens, 'inputTokens') } : {}),
      ...(input.outputTokens !== undefined ? { outputTokens: nonNegativeInteger(input.outputTokens, 'outputTokens') } : {}),
      ...(input.latencyMs !== undefined ? { latencyMs: nonNegativeInteger(input.latencyMs, 'latencyMs') } : {}),
    });
  }

  async failRun(runId: string, errorCode: string, latencyMs?: number): Promise<void> {
    return this.repository.failRun({
      runId: requiredIdentifier(runId, 'runId'),
      errorCode: requiredIdentifier(errorCode, 'errorCode'),
      ...(latencyMs !== undefined ? { latencyMs: nonNegativeInteger(latencyMs, 'latencyMs') } : {}),
    });
  }

  async recordToolCall(input: {
    runId: string;
    toolName: string;
    permission: string;
    argumentsText?: string;
    resultText?: string;
    targetType?: string;
    targetRef?: string;
    inputItemCount?: number;
    outputItemCount?: number;
    durationMs?: number;
    dataAvailability?: 'AVAILABLE' | 'UNAVAILABLE';
    errorCode?: string;
  }): Promise<RecordRef> {
    const argumentsData = redactedHash(input.argumentsText, 4000);
    const resultData = redactedHash(input.resultText, 4000);
    return this.repository.createToolCall({
      runId: requiredIdentifier(input.runId, 'runId'),
      toolName: requiredIdentifier(input.toolName, 'toolName'),
      permission: requiredIdentifier(input.permission, 'permission'),
      ...(argumentsData.hash ? { argumentsHash: argumentsData.hash } : {}),
      ...(argumentsData.hmac ? { argumentsHmac: argumentsData.hmac } : {}),
      ...(resultData.hash ? { resultHash: resultData.hash } : {}),
      ...(resultData.hmac ? { resultHmac: resultData.hmac } : {}),
      ...(input.targetType !== undefined ? { targetType: requiredIdentifier(input.targetType, 'targetType') } : {}),
      ...(input.targetRef !== undefined ? { targetRefHash: hashValue(requiredIdentifier(input.targetRef, 'targetRef')) } : {}),
      ...(input.inputItemCount !== undefined ? { inputItemCount: nonNegativeInteger(input.inputItemCount, 'inputItemCount') } : {}),
      ...(input.outputItemCount !== undefined ? { outputItemCount: nonNegativeInteger(input.outputItemCount, 'outputItemCount') } : {}),
      ...(input.durationMs !== undefined ? { durationMs: nonNegativeInteger(input.durationMs, 'durationMs') } : {}),
      ...(input.dataAvailability ? { dataAvailability: input.dataAvailability } : {}),
      ...(input.errorCode !== undefined ? { errorCode: requiredIdentifier(input.errorCode, 'errorCode') } : {}),
    });
  }

  async saveFeedback(input: {
    runId: string;
    actorUserId: string;
    rating: number;
    comment?: string;
  }): Promise<RecordRef> {
    if (!Number.isSafeInteger(input.rating) || input.rating < 1 || input.rating > 5) {
      throw new AiDatabaseError('AI feedback rating must be an integer from 1 to 5.', 'AI_DATABASE_RATING_INVALID');
    }
    const commentData = redactedHash(input.comment, MAX_COMMENT_LENGTH);
    return this.repository.upsertFeedback({
      runId: requiredIdentifier(input.runId, 'runId'),
      actorUserId: requiredIdentifier(input.actorUserId, 'actorUserId'),
      rating: input.rating,
      ...(commentData.text ? { commentRedacted: commentData.text } : {}),
      ...(commentData.hash ? { commentHash: commentData.hash } : {}),
      ...(commentData.hmac ? { commentHmac: commentData.hmac } : {}),
    });
  }

  async recordBudgetUsage(input: {
    actorUserId: string;
    usageDate: Date;
    feature: string;
    requestCount?: number;
    inputTokens?: number;
    outputTokens?: number;
    costMicros?: bigint;
  }): Promise<RecordRef> {
    return this.repository.upsertBudgetUsage({
      actorUserId: requiredIdentifier(input.actorUserId, 'actorUserId'),
      usageDate: utcDateOnly(input.usageDate),
      feature: requiredIdentifier(input.feature, 'feature'),
      requestCount: nonNegativeInteger(input.requestCount, 'requestCount'),
      inputTokens: nonNegativeInteger(input.inputTokens, 'inputTokens'),
      outputTokens: nonNegativeInteger(input.outputTokens, 'outputTokens'),
      costMicros: nonNegativeBigInt(input.costMicros, 'costMicros'),
    });
  }

  async createActionProposal(input: {
    runId: string;
    requestedById: string;
    actionType: string;
    targetType: string;
    targetRef: string;
    payloadText: string;
    expiresAt: Date;
  }): Promise<RecordRef> {
    const expiresAt = requiredDate(input.expiresAt, 'expiresAt');
    if (expiresAt.getTime() <= Date.now()) {
      throw new AiDatabaseError('Action proposal expiry must be in the future.', 'AI_DATABASE_EXPIRY_INVALID');
    }
    const payload = redactedText(input.payloadText, MAX_BRIEFING_LENGTH);
    if (!payload) throw new AiDatabaseError('Action proposal payload cannot be empty.', 'AI_DATABASE_PAYLOAD_INVALID');
    return this.repository.createActionProposal({
      runId: requiredIdentifier(input.runId, 'runId'),
      requestedById: requiredIdentifier(input.requestedById, 'requestedById'),
      actionType: requiredIdentifier(input.actionType, 'actionType'),
      targetType: requiredIdentifier(input.targetType, 'targetType'),
      targetRef: requiredIdentifier(input.targetRef, 'targetRef'),
      payloadHash: hashValue(payload),
      payloadHmac: hmacValue(payload),
      expiresAt,
    });
  }

  async recordApproval(input: {
    proposalId: string;
    approverUserId: string;
    decision: AiApprovalDecision;
    reason?: string;
  }): Promise<RecordRef> {
    if (!Object.values(AiApprovalDecision).includes(input.decision)) {
      throw new AiDatabaseError('Approval decision is invalid.', 'AI_DATABASE_DECISION_INVALID');
    }
    const reasonData = redactedHash(input.reason, MAX_COMMENT_LENGTH);
    return this.repository.createApproval({
      proposalId: requiredIdentifier(input.proposalId, 'proposalId'),
      approverUserId: requiredIdentifier(input.approverUserId, 'approverUserId'),
      decision: input.decision,
      ...(reasonData.text ? { reasonRedacted: reasonData.text } : {}),
      ...(reasonData.hash ? { reasonHash: reasonData.hash } : {}),
    });
  }

  async upsertDailyBriefing(input: {
    scopeKey: string;
    briefingDate: Date;
    status: AiBriefingStatus;
    modelAlias: string;
    sourceSnapshotHash?: string;
    resultText?: string;
    errorCode?: string;
    generatedAt?: Date;
    expiresAt?: Date;
  }): Promise<RecordRef> {
    if (!Object.values(AiBriefingStatus).includes(input.status)) {
      throw new AiDatabaseError('Briefing status is invalid.', 'AI_DATABASE_STATUS_INVALID');
    }
    const result = redactedHash(input.resultText, MAX_BRIEFING_LENGTH);
    return this.repository.upsertDailyBriefing({
      scopeKey: requiredIdentifier(input.scopeKey, 'scopeKey'),
      briefingDate: utcDateOnly(input.briefingDate),
      status: input.status,
      modelAlias: requiredIdentifier(input.modelAlias, 'modelAlias'),
      ...(input.sourceSnapshotHash !== undefined ? { sourceSnapshotHash: requiredHash(input.sourceSnapshotHash, 'sourceSnapshotHash') } : {}),
      ...(result.text ? { resultRedacted: result.text } : {}),
      ...(result.hash ? { resultHash: result.hash } : {}),
      ...(input.errorCode !== undefined ? { errorCode: requiredIdentifier(input.errorCode, 'errorCode') } : {}),
      ...(input.generatedAt !== undefined ? { generatedAt: requiredDate(input.generatedAt, 'generatedAt') } : {}),
      ...(input.expiresAt !== undefined ? { expiresAt: requiredDate(input.expiresAt, 'expiresAt') } : {}),
    });
  }
}

export const aiDatabaseService = new AiDatabaseService();
