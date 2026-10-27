import assert from 'node:assert/strict';
import test from 'node:test';
import { selectContactPipelineStage, type ContactStageLead } from './contactStage';

const stage = (code: string, name: string, isTerminal = false) => ({ code, name, color: 'blue', isTerminal });

test('contact without leads has no pipeline stage', () => {
  assert.equal(selectContactPipelineStage([], ['WON', 'LOST']), null);
});

test('contact stage comes from the latest open lead pipeline stage, not contact lifecycle', () => {
  const leads: ContactStageLead[] = [
    { status: 'WON', pipelineStage: stage('WON', 'Won', true) },
    { status: 'CONTACTED', pipelineStage: stage('CONTACTED', 'Contacted') },
  ];

  assert.deepEqual(selectContactPipelineStage(leads, ['WON', 'LOST']), stage('CONTACTED', 'Contacted'));
});

test('missing pipeline-stage relation never falls back to a static stage label', () => {
  assert.equal(selectContactPipelineStage([{ status: 'NEW', pipelineStage: null }], ['WON', 'LOST']), null);
});
