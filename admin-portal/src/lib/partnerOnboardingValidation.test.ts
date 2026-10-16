import assert from 'node:assert/strict';
import test from 'node:test';
import {
  getOnboardingProgressStep,
  getPartnerOnboardingStepError,
  getStepToKeepAfterDraftSave,
} from './partnerOnboardingValidation';

test('blocks leaving the account step until partner type is selected', () => {
  assert.equal(
    getPartnerOnboardingStepError('profile', { partnerType: '' }),
    'Please select a partner type before continuing.',
  );
});

test('allows leaving the account step after partner type is selected', () => {
  assert.equal(getPartnerOnboardingStepError('profile', { partnerType: 'SHOWROOM' }), null);
});

test('does not add the partner-type guard to other steps', () => {
  assert.equal(getPartnerOnboardingStepError('business', { partnerType: '' }), null);
});

test('keeps the current step after saving a draft', () => {
  assert.equal(getStepToKeepAfterDraftSave(3), 3);
  assert.equal(getStepToKeepAfterDraftSave(4), 4);
});

test('keeps the progress indicator at the final step after onboarding is complete', () => {
  assert.equal(getOnboardingProgressStep(2, 5, true), 4);
  assert.equal(getOnboardingProgressStep(2, 5, false), 2);
});
