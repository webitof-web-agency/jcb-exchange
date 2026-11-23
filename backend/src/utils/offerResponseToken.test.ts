import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildOfferResponseUrl,
  createOfferResponseToken,
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
