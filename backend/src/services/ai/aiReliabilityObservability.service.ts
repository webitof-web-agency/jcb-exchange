import { randomUUID } from 'node:crypto';
import prisma from '../../lib/prisma';

/**
 * Phase 6 reliability telemetry deliberately accepts metrics only.  Raw
 * messages, prompts, provider keys, tokens, document URLs, and provider
 * payloads are not part of this type and therefore cannot be persisted by
 * the telemetry writer.
 */

export type AiReliabilityEventType = 'QUERY' | 'TOOL' | 'SUREPASS' | 'PROVIDER' | 'CLARIFICATION';
export type AiReliabilityStatus = 'SUCCEEDED' | 'FAILED' | 'DENIED';

export type AiReliabilityEvent = {
  actorUserId?: string;
  eventType: AiReliabilityEventType;
  module?: string;
  toolName?: string;
  provider?: string;
  status: AiReliabilityStatus;
  latencyMs?: number;
  databaseLatencyMs?: number;
  surepassLatencyMs?: number;
  permissionDenied?: boolean;
  clarification?: boolean;
  emptyData?: boolean;
  providerFailure?: boolean;
  forecastConfidence?: number;
  errorCode?: string;
};

export type AiLatencySummary = {
  samples: number;
  averageMs: number;
  p50Ms: number;
  p95Ms: number;
  maxMs: number;
};

export type AiForecastConfidenceSummary = {
  samples: number;
  averageScore: number;
  minScore: number;
  maxScore: number;
};

export type AiReliabilitySummary = {
  totalEvents: number;
  queryCount: number;
  toolCount: number;
  surepassCount: number;
  providerCount: number;
  successCount: number;
  failureCount: number;
  failureRate: number;
  permissionDeniedCount: number;
  clarificationCount: number;
  clarificationRate: number;
  emptyDataCount: number;
  emptyDataRate: number;
  providerFailureCount: number;
  providerFailureRate: number;
  queryLatency: AiLatencySummary;
  databaseLatency: AiLatencySummary;
  providerLatency: AiLatencySummary;
  surepassLatency: AiLatencySummary;
  forecastConfidence: AiForecastConfidenceSummary;
  byModule: Array<{ module: string; events: number }>;
  byTool: Array<{ toolName: string; module: string; events: number }>;
};

const nonNegativeMetric = (value: number | undefined): number | null => {
  if (value === undefined || !Number.isFinite(value)) return value === undefined ? null : 0;
  return Math.max(0, Math.round(value));
};

const boundedConfidence = (value: number | undefined): number | null => {
  if (value === undefined) return null;
  if (!Number.isFinite(value)) return 0;
  return Math.min(100, Math.max(0, Math.round(value)));
};

const percentile = (values: number[], percentileValue: number): number => {
  if (!values.length) return 0;
  const sorted = [...values].sort((left, right) => left - right);
  const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil(sorted.length * percentileValue) - 1));
  return sorted[index] ?? 0;
};

const summarizeLatency = (values: number[]): AiLatencySummary => {
  const normalized = values.map((value) => Math.max(0, Math.round(value)));
  return {
    samples: normalized.length,
    averageMs: normalized.length ? Math.round(normalized.reduce((sum, value) => sum + value, 0) / normalized.length) : 0,
    p50Ms: percentile(normalized, 0.5),
    p95Ms: percentile(normalized, 0.95),
    maxMs: normalized.length ? Math.max(...normalized) : 0,
  };
};

const rate = (numerator: number, denominator: number): number => (
  denominator ? Math.round((numerator / denominator) * 10_000) / 10_000 : 0
);

export const moduleForAiTool = (toolName: string | undefined): string => {
  if (!toolName) return 'ai-router';
  const prefix = toolName.split('.')[0]?.trim();
  if (prefix === 'forecast') return 'forecasting';
  if (prefix === 'rto') return 'rto-documents';
  if (prefix === 'crm' || prefix === 'lead' || prefix === 'hot') return 'crm-leads';
  if (prefix === 'enquiry') return 'enquiries';
  if (prefix === 'customer') return 'customers-visitors';
  if (prefix === 'tasks') return 'tasks';
  if (prefix === 'partner') return 'partners';
  if (prefix === 'finance' || prefix === 'revenue') return 'finance';
  if (prefix && ['invoice', 'payment', 'margin', 'wallet', 'api', 'sell', 'refund', 'accounting', 'journal'].includes(prefix)) return 'finance-commercial';
  if (prefix && ['categories', 'brands', 'models', 'locations'].includes(prefix)) return 'master-data';
  if (prefix && ['blogs', 'translations'].includes(prefix)) return 'content-cms';
  if (prefix === 'settings') return 'settings';
  if (prefix && ['users', 'roles'].includes(prefix)) return 'users-permissions';
  if (prefix === 'subscriptions') return 'subscriptions';
  if (prefix === 'sold') return 'sold-vehicles';
  if (prefix === 'inventory') return 'inventory';
  if (prefix === 'vehicle') return 'vehicle-identity';
  if (prefix === 'verification' || prefix === 'pending') return 'verification';
  if (prefix === 'surepass') return 'surepass';
  if (prefix === 'whatsapp') return 'whatsapp';
  if (prefix === 'communication') return 'communications';
  if (prefix === 'sms') return 'sms';
  if (prefix === 'notifications') return 'notifications';
  if (prefix === 'recruitment') return 'recruitment';
  if (prefix === 'listing' || prefix === 'dashboard') return 'listings';
  return prefix || 'ai-router';
};

export const summarizeAiReliabilityEvents = (events: readonly AiReliabilityEvent[]): AiReliabilitySummary => {
  const queryEvents = events.filter((event) => event.eventType === 'QUERY');
  const toolEvents = events.filter((event) => event.eventType === 'TOOL');
  const surepassEvents = events.filter((event) => event.eventType === 'SUREPASS');
  const providerEvents = events.filter((event) => event.eventType === 'PROVIDER');
  const providerBoundaryEvents = events.filter((event) => event.eventType === 'PROVIDER'
    || event.eventType === 'SUREPASS'
    || (event.eventType === 'QUERY' && event.errorCode === 'AI_PROVIDER_NOT_CONFIGURED'));
  const completedDataEvents = events.filter((event) => event.eventType === 'QUERY' || event.eventType === 'TOOL');
  const queryLatency = summarizeLatency(
    queryEvents.flatMap((event) => {
      const value = nonNegativeMetric(event.latencyMs);
      return value === null ? [] : [value];
    }),
  );
  const databaseLatency = summarizeLatency(
    toolEvents.flatMap((event) => {
      const value = nonNegativeMetric(event.databaseLatencyMs);
      return value === null ? [] : [value];
    }),
  );
  const providerLatency = summarizeLatency(
    providerEvents.flatMap((event) => {
      const value = nonNegativeMetric(event.latencyMs);
      return value === null ? [] : [value];
    }),
  );
  const surepassLatency = summarizeLatency(
    surepassEvents.flatMap((event) => {
      const value = nonNegativeMetric(event.surepassLatencyMs ?? event.latencyMs);
      return value === null ? [] : [value];
    }),
  );
  const confidenceScores = events.flatMap((event) => {
    const value = boundedConfidence(event.forecastConfidence);
    return value === null ? [] : [value];
  });
  const moduleCounts = new Map<string, number>();
  const toolCounts = new Map<string, { module: string; events: number }>();
  for (const event of events) {
    const module = event.module || moduleForAiTool(event.toolName);
    moduleCounts.set(module, (moduleCounts.get(module) || 0) + 1);
    if (event.toolName) {
      const key = `${module}:${event.toolName}`;
      const current = toolCounts.get(key);
      toolCounts.set(key, { module, events: (current?.events || 0) + 1 });
    }
  }

  return {
    totalEvents: events.length,
    queryCount: queryEvents.length,
    toolCount: toolEvents.length,
    surepassCount: surepassEvents.length,
    providerCount: events.filter((event) => event.eventType === 'PROVIDER').length,
    successCount: events.filter((event) => event.status === 'SUCCEEDED').length,
    failureCount: events.filter((event) => event.status === 'FAILED').length,
    failureRate: rate(
      events.filter((event) => event.status === 'FAILED').length,
      events.length,
    ),
    permissionDeniedCount: events.filter((event) => event.permissionDenied === true || event.status === 'DENIED').length,
    clarificationCount: events.filter((event) => event.clarification === true || event.eventType === 'CLARIFICATION').length,
    clarificationRate: rate(
      events.filter((event) => event.clarification === true || event.eventType === 'CLARIFICATION').length,
      queryEvents.length,
    ),
    emptyDataCount: completedDataEvents.filter((event) => event.emptyData === true).length,
    emptyDataRate: rate(
      completedDataEvents.filter((event) => event.emptyData === true).length,
      completedDataEvents.length,
    ),
    // Provider failures are counted at the provider boundary. Query-level
    // errors are intentionally excluded here to avoid double-counting one
    // failed provider call as both a query and a provider failure.
    providerFailureCount: events.filter((event) => event.providerFailure === true
      && (event.eventType === 'PROVIDER' || event.eventType === 'SUREPASS'
        || (event.eventType === 'QUERY' && event.errorCode === 'AI_PROVIDER_NOT_CONFIGURED'))).length,
    providerFailureRate: rate(
      events.filter((event) => event.providerFailure === true
        && (event.eventType === 'PROVIDER' || event.eventType === 'SUREPASS'
          || (event.eventType === 'QUERY' && event.errorCode === 'AI_PROVIDER_NOT_CONFIGURED'))).length,
      providerBoundaryEvents.length,
    ),
    queryLatency,
    databaseLatency,
    providerLatency,
    surepassLatency,
    forecastConfidence: {
      samples: confidenceScores.length,
      averageScore: confidenceScores.length ? Math.round(confidenceScores.reduce((sum, value) => sum + value, 0) / confidenceScores.length) : 0,
      minScore: confidenceScores.length ? Math.min(...confidenceScores) : 0,
      maxScore: confidenceScores.length ? Math.max(...confidenceScores) : 0,
    },
    byModule: [...moduleCounts.entries()]
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([module, count]) => ({ module, events: count })),
    byTool: [...toolCounts.entries()]
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, value]) => ({ toolName: key.slice(value.module.length + 1), ...value })),
  };
};

export type AiReliabilityEventRepository = {
  create: (event: AiReliabilityEvent) => Promise<void>;
};

const IDENTIFIER_PATTERN = /^[a-zA-Z0-9][a-zA-Z0-9._:-]*$/u;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const EVENT_TYPES = new Set<AiReliabilityEventType>(['QUERY', 'TOOL', 'SUREPASS', 'PROVIDER', 'CLARIFICATION']);
const STATUSES = new Set<AiReliabilityStatus>(['SUCCEEDED', 'FAILED', 'DENIED']);

const safeIdentifier = (value: string | undefined, maxLength: number): string | undefined => {
  const normalized = value?.trim();
  if (!normalized || normalized.length > maxLength || !IDENTIFIER_PATTERN.test(normalized)) return undefined;
  return normalized;
};

const safeEvent = (event: AiReliabilityEvent): AiReliabilityEvent => {
  const module = safeIdentifier(event.module, 80);
  const toolName = safeIdentifier(event.toolName, 100);
  const provider = safeIdentifier(event.provider, 40);
  const errorCode = safeIdentifier(event.errorCode, 100);
  const latencyMs = nonNegativeMetric(event.latencyMs);
  const databaseLatencyMs = nonNegativeMetric(event.databaseLatencyMs);
  const surepassLatencyMs = nonNegativeMetric(event.surepassLatencyMs);
  const forecastConfidence = boundedConfidence(event.forecastConfidence);
  return {
    ...(event.actorUserId && UUID_PATTERN.test(event.actorUserId) ? { actorUserId: event.actorUserId } : {}),
    eventType: EVENT_TYPES.has(event.eventType) ? event.eventType : 'QUERY',
    ...(module !== undefined ? { module } : {}),
    ...(toolName !== undefined ? { toolName } : {}),
    ...(provider !== undefined ? { provider } : {}),
    status: STATUSES.has(event.status) ? event.status : 'FAILED',
    ...(latencyMs !== null ? { latencyMs } : {}),
    ...(databaseLatencyMs !== null ? { databaseLatencyMs } : {}),
    ...(surepassLatencyMs !== null ? { surepassLatencyMs } : {}),
    ...(event.permissionDenied === true ? { permissionDenied: true } : {}),
    ...(event.clarification === true ? { clarification: true } : {}),
    ...(event.emptyData === true ? { emptyData: true } : {}),
    ...(event.providerFailure === true ? { providerFailure: true } : {}),
    ...(forecastConfidence !== null ? { forecastConfidence } : {}),
    ...(errorCode !== undefined ? { errorCode } : {}),
  };
};

const defaultRepository: AiReliabilityEventRepository = {
  async create(event) {
    const normalized = safeEvent(event);
    await prisma.aiReliabilityEvent.create({
      data: {
        id: randomUUID(),
        ...(normalized.actorUserId ? { actorUserId: normalized.actorUserId } : {}),
        eventType: normalized.eventType,
        ...(normalized.module ? { module: normalized.module } : {}),
        ...(normalized.toolName ? { toolName: normalized.toolName } : {}),
        ...(normalized.provider ? { provider: normalized.provider } : {}),
        status: normalized.status,
        ...(normalized.latencyMs !== undefined ? { latencyMs: normalized.latencyMs } : {}),
        ...(normalized.databaseLatencyMs !== undefined ? { databaseLatencyMs: normalized.databaseLatencyMs } : {}),
        ...(normalized.surepassLatencyMs !== undefined ? { surepassLatencyMs: normalized.surepassLatencyMs } : {}),
        permissionDenied: normalized.permissionDenied === true,
        clarification: normalized.clarification === true,
        emptyData: normalized.emptyData === true,
        providerFailure: normalized.providerFailure === true,
        ...(normalized.forecastConfidence !== undefined ? { forecastConfidence: normalized.forecastConfidence } : {}),
        ...(normalized.errorCode ? { errorCode: normalized.errorCode } : {}),
      },
    });
  },
};

const fromDate = (days: number) => new Date(Date.now() - days * 24 * 60 * 60 * 1000);

export class AiReliabilityObservabilityService {
  constructor(private readonly repository: AiReliabilityEventRepository = defaultRepository) {}

  async record(event: AiReliabilityEvent): Promise<void> {
    await this.repository.create(safeEvent(event));
  }

  async getSnapshot(input: { days: number; toolName?: string; limit: number }) {
    const rows = await prisma.aiReliabilityEvent.findMany({
      where: {
        createdAt: { gte: fromDate(input.days) },
        ...(input.toolName ? { toolName: input.toolName } : {}),
      },
      orderBy: { createdAt: 'desc' },
      take: 10_000,
      select: {
        id: true,
        actorUserId: true,
        eventType: true,
        module: true,
        toolName: true,
        provider: true,
        status: true,
        latencyMs: true,
        databaseLatencyMs: true,
        surepassLatencyMs: true,
        permissionDenied: true,
        clarification: true,
        emptyData: true,
        providerFailure: true,
        forecastConfidence: true,
        errorCode: true,
        createdAt: true,
      },
    });
    const events: AiReliabilityEvent[] = rows.map((row) => ({
      ...(row.actorUserId ? { actorUserId: row.actorUserId } : {}),
      eventType: EVENT_TYPES.has(row.eventType as AiReliabilityEventType) ? row.eventType as AiReliabilityEventType : 'QUERY',
      ...(row.module ? { module: row.module } : {}),
      ...(row.toolName ? { toolName: row.toolName } : {}),
      ...(row.provider ? { provider: row.provider } : {}),
      status: STATUSES.has(row.status as AiReliabilityStatus) ? row.status as AiReliabilityStatus : 'FAILED',
      ...(row.latencyMs !== null ? { latencyMs: row.latencyMs } : {}),
      ...(row.databaseLatencyMs !== null ? { databaseLatencyMs: row.databaseLatencyMs } : {}),
      ...(row.surepassLatencyMs !== null ? { surepassLatencyMs: row.surepassLatencyMs } : {}),
      ...(row.permissionDenied ? { permissionDenied: true } : {}),
      ...(row.clarification ? { clarification: true } : {}),
      ...(row.emptyData ? { emptyData: true } : {}),
      ...(row.providerFailure ? { providerFailure: true } : {}),
      ...(row.forecastConfidence !== null ? { forecastConfidence: row.forecastConfidence } : {}),
      ...(row.errorCode ? { errorCode: row.errorCode } : {}),
    }));
    return {
      summary: summarizeAiReliabilityEvents(events),
      auditLogs: rows.slice(0, input.limit).map((row) => ({
        id: row.id,
        actorUserId: row.actorUserId,
        eventType: row.eventType,
        module: row.module,
        toolName: row.toolName,
        provider: row.provider,
        status: row.status,
        latencyMs: row.latencyMs ?? 0,
        databaseLatencyMs: row.databaseLatencyMs,
        surepassLatencyMs: row.surepassLatencyMs,
        permissionDenied: row.permissionDenied,
        clarification: row.clarification,
        emptyData: row.emptyData,
        providerFailure: row.providerFailure,
        forecastConfidence: row.forecastConfidence,
        errorCode: row.errorCode,
        createdAt: row.createdAt.toISOString(),
      })),
    };
  }

  async getSnapshotSafe(input: { days: number; toolName?: string; limit: number }) {
    try {
      return { ...(await this.getSnapshot(input)), telemetryStatus: 'available' as const };
    } catch {
      // The application can be deployed before the additive telemetry
      // migration is applied. Report that state instead of breaking admin UI.
      return {
        summary: summarizeAiReliabilityEvents([]),
        auditLogs: [],
        telemetryStatus: 'data_unavailable' as const,
      };
    }
  }
}

export const aiReliabilityObservabilityService = new AiReliabilityObservabilityService();
