"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.buildNotificationWhereClause = exports.getNotificationStatus = exports.getNotificationScope = exports.vehicleNotificationTypes = void 0;
exports.vehicleNotificationTypes = new Set(['NEW_LISTING', 'LISTING_UPDATE']);
const getNotificationScope = (value) => {
    if (typeof value !== 'string') {
        return 'all';
    }
    const normalized = value.trim().toLowerCase();
    return normalized === 'vehicle' ? 'vehicle' : 'all';
};
exports.getNotificationScope = getNotificationScope;
const getNotificationStatus = (value) => {
    if (typeof value !== 'string') {
        return 'all';
    }
    const normalized = value.trim().toLowerCase();
    return normalized === 'unread' ? 'unread' : 'all';
};
exports.getNotificationStatus = getNotificationStatus;
const buildNotificationWhereClause = (userId, options) => {
    const scope = options.scope ?? 'all';
    const status = options.status ?? 'all';
    return {
        userId,
        ...(status === 'unread' ? { isRead: false } : {}),
        ...(scope === 'vehicle'
            ? {
                type: {
                    in: Array.from(exports.vehicleNotificationTypes),
                },
            }
            : {}),
    };
};
exports.buildNotificationWhereClause = buildNotificationWhereClause;
//# sourceMappingURL=notificationFilters.js.map