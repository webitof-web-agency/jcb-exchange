import { randomUUID } from 'node:crypto';
import prisma from '../../lib/prisma';
import { aiDatabaseService } from './aiDatabase.service';
import { auditHmacHex, sha256Hex } from './aiSecurity.service';
import { aiSecurityAuditService } from './aiSecurityAudit.service';
import { aiReliabilityObservabilityService, moduleForAiTool } from './aiReliabilityObservability.service';

export type AiToolExecutionStatus = 'SUCCEEDED' | 'FAILED';
export type AiToolPermissionDecision = 'ALLOWED' | 'DENIED';
export type AiToolDataAvailability = 'AVAILABLE' | 'UNAVAILABLE';

export type AiToolExecutionAuditEvent = {
  actorUserId: string;
  role: string;
  toolName: string;
  permission: AiToolPermissionDecision;
  status: AiToolExecutionStatus;
  arguments?: unknown;
  result?: unknown;
  durationMs: number;
  databaseLatencyMs?: number;
  module?: string;
  dataAvailability?: AiToolDataAvailability;
  emptyData?: boolean;
  forecastConfidence?: number;
  errorCode?: string;
  maskedFields?: readonly string[];
};

export type AiToolExecutionObservability = {
  recordExecution: (event: AiToolExecutionAuditEvent) => Promise<void>;
};

export type AiToolLatencySample = {
  toolName: string;
  status: AiToolExecutionStatus;
  permission: AiToolPermissionDecision;
  durationMs: number;
};

export type AiToolLatencySummary = {
  sampledExecutions: number;
  succeeded: number;
  failed: number;
  denied: number;
  averageMs: number;
  p50Ms: number;
  p95Ms: number;
  maxMs: number;
  slowExecutions: number;
  byTool: Array<{
    toolName: string;
    executions: number;
    succeeded: number;
    failed: number;
    denied: number;
    averageMs: number;
    p95Ms: number;
    maxMs: number;
  }>;
};

const safeJson = (value: unknown): string | undefined => {
  if (value === undefined) return undefined;
  try {
    return JSON.stringify(value);
  } catch {
    return '[UNSERIALIZABLE]';
  }
};

const itemCount = (value: unknown): number | undefined => {
  if (Array.isArray(value)) return value.length;
  if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>;
    for (const key of ['items', 'partners', 'trend', 'pipeline', 'byEvent', 'byStatus', 'byTask']) {
      if (Array.isArray(record[key])) return record[key].length;
    }
  }
  return undefined;
};

const percentile = (values: number[], percentileValue: number): number => {
  if (!values.length) return 0;
  const sorted = [...values].sort((left, right) => left - right);
  const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil(sorted.length * percentileValue) - 1));
  return sorted[index] ?? 0;
};

export const summarizeAiToolLatency = (samples: AiToolLatencySample[], slowThresholdMs = 1000): AiToolLatencySummary => {
  const durations = samples.map((sample) => Math.max(0, Math.round(sample.durationMs)));
  const byTool = new Map<string, AiToolLatencySample[]>();
  for (const sample of samples) {
    const rows = byTool.get(sample.toolName) || [];
    rows.push(sample);
    byTool.set(sample.toolName, rows);
  }

  return {
    sampledExecutions: samples.length,
    succeeded: samples.filter((sample) => sample.status === 'SUCCEEDED').length,
    failed: samples.filter((sample) => sample.status === 'FAILED').length,
    denied: samples.filter((sample) => sample.permission === 'DENIED').length,
    averageMs: durations.length ? Math.round(durations.reduce((sum, value) => sum + value, 0) / durations.length) : 0,
    p50Ms: percentile(durations, 0.5),
    p95Ms: percentile(durations, 0.95),
    maxMs: durations.length ? Math.max(...durations) : 0,
    slowExecutions: durations.filter((value) => value >= slowThresholdMs).length,
    byTool: [...byTool.entries()].sort(([left], [right]) => left.localeCompare(right)).map(([toolName, rows]) => {
      const toolDurations = rows.map((row) => Math.max(0, Math.round(row.durationMs)));
      return {
        toolName,
        executions: rows.length,
        succeeded: rows.filter((row) => row.status === 'SUCCEEDED').length,
        failed: rows.filter((row) => row.status === 'FAILED').length,
        denied: rows.filter((row) => row.permission === 'DENIED').length,
        averageMs: Math.round(toolDurations.reduce((sum, value) => sum + value, 0) / toolDurations.length),
        p95Ms: percentile(toolDurations, 0.95),
        maxMs: Math.max(...toolDurations),
      };
    }),
  };
};

const defaultObservability: AiToolExecutionObservability = {
  async recordExecution(event) {
    if (event.maskedFields?.length) {
      await aiSecurityAuditService.record({
        actorUserId: event.actorUserId,
        action: 'AI_SENSITIVE_DATA_MASKED',
        role: event.role,
        toolName: event.toolName,
        maskedFields: event.maskedFields,
        reason: 'Provider-safe tool serialization',
      });
    }
    const argumentsText = safeJson(event.arguments);
    const resultText = safeJson(event.result);
    const inputItemCount = itemCount(event.arguments);
    const outputItemCount = itemCount(event.result);
    const correlationText = `${event.actorUserId}:${event.toolName}:${argumentsText || ''}`;
    const run = await aiDatabaseService.startRun({
      requestId: `tool:${randomUUID()}`,
      actorUserId: event.actorUserId,
      feature: 'AI_READ_ONLY_TOOL',
      provider: 'INTERNAL',
      modelAlias: 'DATABASE',
      promptHash: sha256Hex(correlationText),
      promptHmac: auditHmacHex(correlationText),
    });

    await aiDatabaseService.recordToolCall({
      runId: run.id,
      toolName: event.toolName,
      permission: event.permission,
      ...(argumentsText !== undefined ? { argumentsText } : {}),
      ...(resultText !== undefined ? { resultText } : {}),
      ...(inputItemCount !== undefined ? { inputItemCount } : {}),
      ...(outputItemCount !== undefined ? { outputItemCount } : {}),
      durationMs: Math.max(0, Math.round(event.durationMs)),
      ...(event.dataAvailability ? { dataAvailability: event.dataAvailability } : {}),
      ...(event.errorCode ? { errorCode: event.errorCode } : {}),
    });

    if (event.status === 'SUCCEEDED') {
      await aiDatabaseService.completeRun(run.id, {
        responseText: resultText || 'No data',
        outputWords: 0,
        latencyMs: Math.max(0, Math.round(event.durationMs)),
      });
    } else {
      await aiDatabaseService.failRun(run.id, event.errorCode || 'AI_TOOL_EXECUTION_FAILED', Math.max(0, Math.round(event.durationMs)));
    }

    // Reliability telemetry is intentionally best-effort. A pending telemetry
    // migration or a temporary metrics write failure must not break a read-only
    // operator query that already passed the existing audit path.
    try {
      await aiReliabilityObservabilityService.record({
        actorUserId: event.actorUserId,
        eventType: 'TOOL',
        module: event.module || moduleForAiTool(event.toolName),
        toolName: event.toolName,
        provider: 'INTERNAL',
        status: event.permission === 'DENIED' ? 'DENIED' : event.status,
        latencyMs: event.durationMs,
        ...(event.databaseLatencyMs !== undefined ? { databaseLatencyMs: event.databaseLatencyMs } : {}),
        permissionDenied: event.permission === 'DENIED',
        emptyData: event.emptyData === true || event.dataAvailability === 'UNAVAILABLE',
        ...(event.forecastConfidence !== undefined ? { forecastConfidence: event.forecastConfidence } : {}),
        ...(event.errorCode ? { errorCode: event.errorCode } : {}),
      });
    } catch {
      // Metrics must never make the user-facing AI query fail.
    }
  },
};

const toDate = (days: number) => new Date(Date.now() - days * 24 * 60 * 60 * 1000);

export class AiToolObservabilityService {
  constructor(private readonly observability: AiToolExecutionObservability = defaultObservability) {}

  async recordExecution(event: AiToolExecutionAuditEvent): Promise<void> {
    return this.observability.recordExecution(event);
  }

  async getSnapshot(input: { days: number; toolName?: string; limit: number }) {
    const rows = await prisma.aiToolCall.findMany({
      where: {
        ...(input.toolName ? { toolName: input.toolName } : {}),
        run: { feature: 'AI_READ_ONLY_TOOL', createdAt: { gte: toDate(input.days) } },
      },
      orderBy: { createdAt: 'desc' },
      take: 10_000,
      select: {
        id: true,
        toolName: true,
        permission: true,
        status: true,
        dataAvailability: true,
        durationMs: true,
        errorCode: true,
        createdAt: true,
        run: {
          select: {
            actorUserId: true,
            actor: { select: { role: true } },
          },
        },
      },
    });
    const samples: AiToolLatencySample[] = rows.map((row) => ({
      toolName: row.toolName,
      status: row.status === 'SUCCEEDED' ? 'SUCCEEDED' : 'FAILED',
      permission: row.permission === 'DENIED' ? 'DENIED' : 'ALLOWED',
      durationMs: row.durationMs ?? 0,
    }));
    return {
      summary: summarizeAiToolLatency(samples),
      auditLogs: rows.slice(0, input.limit).map((row) => ({
        id: row.id,
        toolName: row.toolName,
        permission: row.permission,
        status: row.status,
        dataAvailability: row.dataAvailability,
        durationMs: row.durationMs ?? 0,
        errorCode: row.errorCode,
        actorUserId: row.run.actorUserId,
        actorRole: row.run.actor.role,
        createdAt: row.createdAt.toISOString(),
      })),
    };
  }
}

export const aiToolObservabilityService = new AiToolObservabilityService();
