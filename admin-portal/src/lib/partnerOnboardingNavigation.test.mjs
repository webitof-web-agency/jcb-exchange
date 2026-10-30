import assert from 'node:assert/strict';
import test from 'node:test';
import { saveBeforeStepAdvance } from './partnerOnboardingNavigation.mjs';

test('validates and saves before advancing to the next onboarding step', async () => {
  const events = [];

  const result = await saveBeforeStepAdvance({
    currentStep: 1,
    targetStep: 2,
    validate: () => {
      events.push('validate');
      return null;
    },
    save: async () => {
      events.push('save');
    },
  });

  assert.deepEqual(events, ['validate', 'save']);
  assert.deepEqual(result, { advanced: true, saved: true, targetStep: 2 });
});

test('does not autosave or advance when the current step is invalid', async () => {
  const events = [];

  const result = await saveBeforeStepAdvance({
    currentStep: 0,
    targetStep: 1,
    validate: () => {
      events.push('validate');
      return 'Please select a partner type before continuing.';
    },
    save: async () => {
      events.push('save');
    },
  });

  assert.deepEqual(events, ['validate']);
  assert.deepEqual(result, {
    advanced: false,
    saved: false,
    error: 'Please select a partner type before continuing.',
  });
});

test('does not advance when the autosave request fails', async () => {
  const events = [];

  const result = await saveBeforeStepAdvance({
    currentStep: 2,
    targetStep: 3,
    validate: () => null,
    save: async () => {
      events.push('save');
      return false;
    },
  });

  assert.deepEqual(events, ['save']);
  assert.deepEqual(result, { advanced: false, saved: false });
});
