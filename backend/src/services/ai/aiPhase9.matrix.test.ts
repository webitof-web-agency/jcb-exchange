import assert from 'node:assert/strict';
import test from 'node:test';
import {
  AI_PHASE7_SCENARIOS,
  AI_PHASE7_LANGUAGE_CASES,
  AI_PHASE7_TOOL_MATRIX,
} from './aiPhase7TestMatrix';
import { moduleForAiTool } from './aiReliabilityObservability.service';
import { routeAiMessage } from './aiIntentRouter.service';

const PHASE9_REQUIRED_SCENARIOS = [
  'english_query',
  'hindi_query',
  'hinglish_query',
  'spelling_mistake',
  'mixed_language_query',
  'valid_id',
  'invalid_id',
  'duplicate_record',
  'empty_result',
  'permission_denied',
  'surepass_unavailable',
  'database_unavailable',
  'provider_unavailable',
  'sensitive_field_request',
  'mutation_request',
] as const;

test('Phase 9 scenario matrix is exhaustive for every read-only tool', () => {
  assert.deepEqual([...AI_PHASE7_SCENARIOS].sort(), [...PHASE9_REQUIRED_SCENARIOS].sort());
  for (const entry of AI_PHASE7_TOOL_MATRIX) {
    assert.deepEqual([...entry.scenarios].sort(), [...PHASE9_REQUIRED_SCENARIOS].sort(), entry.toolName);
  }
});

test('Phase 9 has language coverage for every operational module', () => {
  const requiredModules = new Set(AI_PHASE7_TOOL_MATRIX.map((entry) => entry.module));
  const coveredModules = new Set(
    AI_PHASE7_LANGUAGE_CASES.map((entry) => moduleForAiTool(entry.toolName)),
  );

  assert.deepEqual(
    [...requiredModules].filter((module) => !coveredModules.has(module)),
    [],
    'Every operational module needs English, Hindi, Hinglish, spelling and mixed-language cases.',
  );
});

test('Phase 9 mutation requests fail closed for every read-only tool', () => {
  for (const entry of AI_PHASE7_TOOL_MATRIX) {
    assert.equal(routeAiMessage(`delete ${entry.toolName}`), null, entry.toolName);
  }
});
