import test from 'node:test';
import assert from 'node:assert/strict';
import { getInitialLeadStage, getStageStepperOptions, LEAD_SAVED_VIEWS, shouldRenderPipelineStage } from './leadViews';

test('all records is the first visible saved view and has no filters', () => {
  assert.equal(LEAD_SAVED_VIEWS[0].key, 'all');
  assert.equal(LEAD_SAVED_VIEWS[0].label, 'All Records');
  assert.deepEqual(LEAD_SAVED_VIEWS[0].filters, {});
});

test('embedded Kanban keeps every configured stage visible while filters limit cards', () => {
  assert.equal(shouldRenderPipelineStage({ embedded: true, showClosed: false, isTerminal: true }), true);
  assert.equal(shouldRenderPipelineStage({ embedded: false, showClosed: false, isTerminal: true }), false);
  assert.equal(shouldRenderPipelineStage({ embedded: false, showClosed: true, isTerminal: true }), true);
});

test('new leads default to the first configured open stage', () => {
  assert.equal(
    getInitialLeadStage([
      { code: 'CONTACTED', isTerminal: false },
      { code: 'WON', isTerminal: true },
    ]),
    'CONTACTED',
  );
  assert.equal(getInitialLeadStage([]), 'NEW');
});

test('detail stepper uses configured stages and never falls back to a fixed stage list', () => {
  const configured = [{ code: 'CUSTOM_REVIEW', name: 'Custom Review', isTerminal: false }];
  assert.deepEqual(getStageStepperOptions(configured, 'CUSTOM_REVIEW'), configured);
  assert.deepEqual(getStageStepperOptions([], 'CUSTOM_REVIEW'), [{ code: 'CUSTOM_REVIEW', name: 'CUSTOM_REVIEW', isTerminal: false }]);
});
