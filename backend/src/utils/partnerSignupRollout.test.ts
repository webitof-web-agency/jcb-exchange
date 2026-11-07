import assert from 'node:assert/strict';
import test from 'node:test';
import {
  getPartnerSignupRolloutConfig,
  isPartnerSignupGloballyEnabled,
  isPartnerSignupInRollout,
} from './partnerSignupRollout';

test('partner signup rollout is enabled at 100% by default', () => {
  const config = getPartnerSignupRolloutConfig({});
  assert.deepEqual(config, {
    enabled: true,
    percentage: 100,
    salt: 'jcb-exchange-partner-signup-v1',
  });
  assert.equal(isPartnerSignupInRollout('dealer@example.com', {}), true);
});

test('global rollout disable is deterministic and blocks the flow', () => {
  const env = { PARTNER_SIGNUP_ENABLED: 'false', PARTNER_SIGNUP_ROLLOUT_PERCENT: '100' };
  assert.equal(isPartnerSignupGloballyEnabled(env), false);
  assert.equal(isPartnerSignupInRollout('dealer@example.com', env), false);
});

test('percentage rollout is stable for the same identity', () => {
  const env = { PARTNER_SIGNUP_ROLLOUT_PERCENT: '25', PARTNER_SIGNUP_ROLLOUT_SALT: 'test-salt' };
  const first = isPartnerSignupInRollout('Dealer@Example.com', env);
  assert.equal(first, isPartnerSignupInRollout('dealer@example.com', env));
  assert.equal(isPartnerSignupInRollout('', env), false);
});

test('rollout percentage is clamped to the safe range', () => {
  assert.equal(getPartnerSignupRolloutConfig({ PARTNER_SIGNUP_ROLLOUT_PERCENT: '-10' }).percentage, 0);
  assert.equal(getPartnerSignupRolloutConfig({ PARTNER_SIGNUP_ROLLOUT_PERCENT: '250' }).percentage, 100);
  assert.equal(getPartnerSignupRolloutConfig({ PARTNER_SIGNUP_ROLLOUT_PERCENT: 'invalid' }).percentage, 100);
});
