import assert from 'node:assert/strict';
import test from 'node:test';
import {
  DEFAULT_PIPELINE_STAGES,
  buildPipelineStageCode,
  canDeletePipelineStage,
  getPipelineStageStatusSets,
  normalizePipelineStageInput,
} from './pipelineStages';

test('default CRM stages preserve the current pipeline order and codes', () => {
  assert.deepEqual(
    DEFAULT_PIPELINE_STAGES.map((stage) => stage.code),
    ['NEW', 'CONTACTED', 'QUALIFIED', 'INTERESTED', 'INSPECTION_SCHEDULED', 'NEGOTIATION', 'ON_HOLD', 'WON', 'LOST'],
  );
});

test('stage input derives a safe code and keeps valid display settings', () => {
  assert.deepEqual(
    normalizePipelineStageInput({ name: '  Demo Review  ', order: '4', color: 'purple', isTerminal: true }),
    { name: 'Demo Review', code: 'DEMO_REVIEW', order: 4, color: 'purple', isTerminal: true },
  );
  assert.equal(buildPipelineStageCode('Inspection / Ready'), 'INSPECTION_READY');
});

test('a stage can only be deleted when it has no leads', () => {
  assert.equal(canDeletePipelineStage(0), true);
  assert.equal(canDeletePipelineStage(1), false);
  assert.equal(canDeletePipelineStage(4), false);
  assert.equal(canDeletePipelineStage(0, false, 1), false);
  assert.equal(canDeletePipelineStage(0, true, 1), true);
});

test('open and terminal status sets come from configured stage metadata', () => {
  assert.deepEqual(
    getPipelineStageStatusSets([
      { code: 'NEW', isTerminal: false },
      { code: 'REVIEW', isTerminal: false },
      { code: 'WON', isTerminal: true },
      { code: 'ARCHIVED', isTerminal: true },
    ]),
    { open: ['NEW', 'REVIEW'], terminal: ['WON', 'ARCHIVED'] },
  );
});
