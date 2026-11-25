import test from 'node:test';
import assert from 'node:assert/strict';
import {
  OFFER_LINK_LIFETIME_DAYS,
  buildOfferResponseUrl,
  createOfferResponseToken,
  offerLinkExpiryTimestamp,
  resolveOfferLinkSecrets,
  resolveOfferResponseOrigin,
  verifyOfferResponseToken,
} from './offerResponseToken';

test('offer response tokens round-trip the offer id and version', () => {
  const token = createOfferResponseToken('offer-123', 4, 1_900_000_000, 'test-secret');
  assert.deepEqual(verifyOfferResponseToken(token, 'test-secret', 1_800_000_000), {
    offerId: 'offer-123',
    version: 4,
    expiresAt: 1_900_000_000,
  });
});

test('offer response tokens reject tampering, wrong secret, and expiry', () => {
  const token = createOfferResponseToken('offer-123', 4, 1_900_000_000, 'test-secret');
  assert.equal(verifyOfferResponseToken(`${token}x`, 'test-secret', 1_800_000_000), null);
  assert.equal(verifyOfferResponseToken(token, 'wrong-secret', 1_800_000_000), null);
  assert.equal(verifyOfferResponseToken(token, 'test-secret', 2_000_000_000), null);
});

test('offer response URL uses the configured public origin', () => {
  assert.equal(
    buildOfferResponseUrl('offer-token', 'https://portal.example.test/'),
    'https://portal.example.test/offer-response/offer-token',
  );
});

test('links signed with either the offer-link secret or the older JWT secret keep verifying', () => {
  const env = { OFFER_LINK_SECRET: 'offer-secret', JWT_SECRET: 'jwt-secret', NODE_ENV: 'test' } as NodeJS.ProcessEnv;
  const secrets = resolveOfferLinkSecrets(env);
  assert.deepEqual(secrets, ['offer-secret', 'jwt-secret']);
  const oldLink = createOfferResponseToken('offer-123', 2, 1_900_000_000, 'jwt-secret');
  const newLink = createOfferResponseToken('offer-123', 2, 1_900_000_000, secrets[0]);
  assert.equal(verifyOfferResponseToken(oldLink, secrets, 1_800_000_000)?.offerId, 'offer-123');
  assert.equal(verifyOfferResponseToken(newLink, secrets, 1_800_000_000)?.offerId, 'offer-123');
  assert.equal(verifyOfferResponseToken(newLink, ['other'], 1_800_000_000), null);

  // HR closes an offer; the link itself lasts long.
  assert.equal(offerLinkExpiryTimestamp(0), OFFER_LINK_LIFETIME_DAYS * 24 * 60 * 60);
  assert.equal(resolveOfferResponseOrigin({ OFFER_RESPONSE_BASE_URL: 'https://careers.example.test', PUBLIC_SITE_URL: 'https://x.test' } as NodeJS.ProcessEnv), 'https://careers.example.test');
  assert.equal(resolveOfferResponseOrigin({ PUBLIC_SITE_URL: 'https://x.test' } as NodeJS.ProcessEnv), 'https://x.test');
});
