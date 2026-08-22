import assert from 'node:assert/strict';
import {
  buildNotificationWhereClause,
  getNotificationScope,
  getNotificationStatus,
  vehicleNotificationTypes,
} from '../src/utils/notificationFilters';

const userId = 'user-123';

assert.equal(getNotificationScope(undefined), 'all');
assert.equal(getNotificationScope('vehicle'), 'vehicle');
assert.equal(getNotificationScope(' VEHICLE '), 'vehicle');
assert.equal(getNotificationScope('anything-else'), 'all');

assert.equal(getNotificationStatus(undefined), 'all');
assert.equal(getNotificationStatus('unread'), 'unread');
assert.equal(getNotificationStatus(' UnRead '), 'unread');
assert.equal(getNotificationStatus('read'), 'all');

assert.deepEqual(buildNotificationWhereClause(userId, {}), {
  userId,
});

assert.deepEqual(buildNotificationWhereClause(userId, { status: 'unread' }), {
  userId,
  isRead: false,
});

assert.deepEqual(
  buildNotificationWhereClause(userId, { scope: 'vehicle', status: 'unread' }),
  {
    userId,
    isRead: false,
    type: {
      in: Array.from(vehicleNotificationTypes),
    },
  },
);

console.log('Notification bell unread filtering contract verified.');
