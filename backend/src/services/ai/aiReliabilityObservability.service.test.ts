import assert from 'node:assert/strict';
import test from 'node:test';
import {
  AiReliabilityObservabilityService,
  summarizeAiReliabilityEvents,
  type AiReliabilityEvent,
} from './aiReliabilityObservability.service';

test('summarizes Phase 6 reliability dimensions without raw payload fields', () => {
  const events: AiReliabilityEvent[] = [
    {
      eventType: 'QUERY',
      module: 'listings',
      toolName: 'listing.statistics',
      status: 'SUCCEEDED',
      latencyMs: 100,
    },
    {
      eventType: 'QUERY',
      module: 'listings',
      toolName: 'listing.statistics',
      status: 'SUCCEEDED',
      latencyMs: 300,
      emptyData: true,
    },
    {
      eventType: 'CLARIFICATION',
      module: 'ai-router',
      status: 'SUCCEEDED',
      latencyMs: 50,
      clarification: true,
    },
    {
      eventType: 'TOOL',
      module: 'listings',
      toolName: 'listing.statistics',
      status: 'DENIED',
      permissionDenied: true,
      latencyMs: 20,
    },
    {
      eventType: 'TOOL',
      module: 'listings',
      toolName: 'listing.statistics',
      status: 'SUCCEEDED',
      latencyMs: 240,
      databaseLatencyMs: 220,
    },
    {
      eventType: 'SUREPASS',
      module: 'surepass',
      toolName: 'rc-full',
      status: 'FAILED',
      latencyMs: 900,
      surepassLatencyMs: 900,
      providerFailure: true,
    },
    {
      eventType: 'PROVIDER',
      module: 'ai-provider',
      provider: 'openai',
      status: 'FAILED',
      latencyMs: 700,
      providerFailure: true,
    },
    {
      eventType: 'QUERY',
      module: 'forecasting',
      toolName: 'forecast.operations',
      status: 'SUCCEEDED',
      latencyMs: 400,
      forecastConfidence: 87,
    },
  ];

  const summary = summarizeAiReliabilityEvents(events);

  assert.equal(summary.totalEvents, 8);
  assert.equal(summary.queryCount, 3);
  assert.equal(summary.toolCount, 2);
  assert.equal(summary.surepassCount, 1);
  assert.equal(summary.providerCount, 1);
  assert.equal(summary.successCount, 5);
  assert.equal(summary.failureCount, 2);
  assert.equal(summary.failureRate, 0.25);
  assert.equal(summary.permissionDeniedCount, 1);
  assert.equal(summary.clarificationCount, 1);
  assert.equal(summary.clarificationRate, 0.3333);
  assert.equal(summary.emptyDataCount, 1);
  assert.equal(summary.emptyDataRate, 0.2);
  assert.equal(summary.providerFailureCount, 2);
  assert.equal(summary.providerFailureRate, 1);
  assert.deepEqual(summary.queryLatency, { samples: 3, averageMs: 267, p50Ms: 300, p95Ms: 400, maxMs: 400 });
  assert.deepEqual(summary.databaseLatency, { samples: 1, averageMs: 220, p50Ms: 220, p95Ms: 220, maxMs: 220 });
  assert.deepEqual(summary.surepassLatency, { samples: 1, averageMs: 900, p50Ms: 900, p95Ms: 900, maxMs: 900 });
  assert.deepEqual(summary.providerLatency, { samples: 1, averageMs: 700, p50Ms: 700, p95Ms: 700, maxMs: 700 });
  assert.deepEqual(summary.forecastConfidence, { samples: 1, averageScore: 87, minScore: 87, maxScore: 87 });
  assert.deepEqual(summary.byModule, [
    { module: 'ai-provider', events: 1 },
    { module: 'ai-router', events: 1 },
    { module: 'forecasting', events: 1 },
    { module: 'listings', events: 4 },
    { module: 'surepass', events: 1 },
  ]);
});

test('normalizes invalid durations and confidence values for safe aggregation', () => {
  const summary = summarizeAiReliabilityEvents([
    { eventType: 'QUERY', status: 'SUCCEEDED', latencyMs: -20, forecastConfidence: 150 },
    { eventType: 'QUERY', status: 'FAILED', latencyMs: Number.NaN, forecastConfidence: -5 },
  ]);

  assert.deepEqual(summary.queryLatency, { samples: 2, averageMs: 0, p50Ms: 0, p95Ms: 0, maxMs: 0 });
  assert.deepEqual(summary.forecastConfidence, { samples: 2, averageScore: 50, minScore: 0, maxScore: 100 });
});

test('includes provider configuration failures in the provider failure rate denominator', () => {
  const summary = summarizeAiReliabilityEvents([{
    eventType: 'QUERY',
    status: 'FAILED',
    providerFailure: true,
    errorCode: 'AI_PROVIDER_NOT_CONFIGURED',
  }]);

  assert.equal(summary.providerFailureCount, 1);
  assert.equal(summary.providerFailureRate, 1);
});

test('persists only allow-listed safe telemetry fields', async () => {
  const stored: AiReliabilityEvent[] = [];
  const service = new AiReliabilityObservabilityService({
    create: async (event) => { stored.push(event); },
  });

  await service.record({
    actorUserId: 'not-a-user-id',
    eventType: 'QUERY',
    module: 'listing statistics',
    toolName: 'listing.statistics',
    status: 'SUCCEEDED',
    errorCode: 'provider failure: secret-key',
    latencyMs: 18.6,
    forecastConfidence: 140,
    ...( { message: 'private operator message', apiKey: 'secret' } as unknown as Partial<AiReliabilityEvent> ),
  });

  assert.equal(stored.length, 1);
  assert.deepEqual(stored[0], {
    eventType: 'QUERY',
    toolName: 'listing.statistics',
    status: 'SUCCEEDED',
    latencyMs: 19,
    forecastConfidence: 100,
  });
  assert.equal('message' in stored[0]!, false);
  assert.equal('apiKey' in stored[0]!, false);
});
