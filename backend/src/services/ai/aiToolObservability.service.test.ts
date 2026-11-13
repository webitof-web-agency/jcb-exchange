import assert from 'node:assert/strict';
import test from 'node:test';
import { summarizeAiToolLatency, type AiToolLatencySample } from './aiToolObservability.service';

test('summarizes tool latency with p50, p95, failures, denials, and slow-query count', () => {
  const samples: AiToolLatencySample[] = [
    { toolName: 'listing.search', status: 'SUCCEEDED', permission: 'ALLOWED', durationMs: 40 },
    { toolName: 'listing.search', status: 'SUCCEEDED', permission: 'ALLOWED', durationMs: 80 },
    { toolName: 'listing.search', status: 'FAILED', permission: 'DENIED', durationMs: 120 },
    { toolName: 'finance.trend', status: 'SUCCEEDED', permission: 'ALLOWED', durationMs: 240 },
  ];

  const summary = summarizeAiToolLatency(samples, 100);

  assert.equal(summary.sampledExecutions, 4);
  assert.equal(summary.succeeded, 3);
  assert.equal(summary.failed, 1);
  assert.equal(summary.denied, 1);
  assert.equal(summary.averageMs, 120);
  assert.equal(summary.p50Ms, 80);
  assert.equal(summary.p95Ms, 240);
  assert.equal(summary.slowExecutions, 2);
  assert.deepEqual(summary.byTool, [
    { toolName: 'finance.trend', executions: 1, succeeded: 1, failed: 0, denied: 0, averageMs: 240, p95Ms: 240, maxMs: 240 },
    { toolName: 'listing.search', executions: 3, succeeded: 2, failed: 1, denied: 1, averageMs: 80, p95Ms: 120, maxMs: 120 },
  ]);
});
