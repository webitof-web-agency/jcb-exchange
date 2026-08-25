"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const strict_1 = __importDefault(require("node:assert/strict"));
const notificationFilters_1 = require("../src/utils/notificationFilters");
const userId = 'user-123';
strict_1.default.equal((0, notificationFilters_1.getNotificationScope)(undefined), 'all');
strict_1.default.equal((0, notificationFilters_1.getNotificationScope)('vehicle'), 'vehicle');
strict_1.default.equal((0, notificationFilters_1.getNotificationScope)(' VEHICLE '), 'vehicle');
strict_1.default.equal((0, notificationFilters_1.getNotificationScope)('anything-else'), 'all');
strict_1.default.equal((0, notificationFilters_1.getNotificationStatus)(undefined), 'all');
strict_1.default.equal((0, notificationFilters_1.getNotificationStatus)('unread'), 'unread');
strict_1.default.equal((0, notificationFilters_1.getNotificationStatus)(' UnRead '), 'unread');
strict_1.default.equal((0, notificationFilters_1.getNotificationStatus)('read'), 'all');
strict_1.default.deepEqual((0, notificationFilters_1.buildNotificationWhereClause)(userId, {}), {
    userId,
});
strict_1.default.deepEqual((0, notificationFilters_1.buildNotificationWhereClause)(userId, { status: 'unread' }), {
    userId,
    isRead: false,
});
strict_1.default.deepEqual((0, notificationFilters_1.buildNotificationWhereClause)(userId, { scope: 'vehicle', status: 'unread' }), {
    userId,
    isRead: false,
    type: {
        in: Array.from(notificationFilters_1.vehicleNotificationTypes),
    },
});
console.log('Notification bell unread filtering contract verified.');
//# sourceMappingURL=test-notification-bell-unread.js.map