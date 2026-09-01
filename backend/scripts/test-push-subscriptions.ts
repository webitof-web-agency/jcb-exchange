import assert from 'node:assert/strict';
import {
  isExpiredPushSubscriptionError,
  isPushSubscriptionPayload,
} from '../src/utils/pushSubscriptions';

const validSubscription = {
  endpoint: 'https://fcm.googleapis.com/fcm/send/example',
  expirationTime: null,
  keys: {
    auth: 'auth-key',
    p256dh: 'p256dh-key',
  },
};

assert.equal(isPushSubscriptionPayload(validSubscription), true);
assert.equal(
  isPushSubscriptionPayload({
    endpoint: 'https://example.com',
    keys: { auth: 'auth-only' },
  }),
  false,
);
assert.equal(isPushSubscriptionPayload({ endpoint: '' }), false);

assert.equal(isExpiredPushSubscriptionError({ statusCode: 404 }), true);
assert.equal(isExpiredPushSubscriptionError({ statusCode: 410 }), true);
assert.equal(isExpiredPushSubscriptionError({ statusCode: 500 }), false);
assert.equal(isExpiredPushSubscriptionError(null), false);

console.log('Push subscription contract verified.');
