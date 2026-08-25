"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.markAllAsRead = exports.markAsRead = exports.getNotifications = void 0;
const prisma_1 = __importDefault(require("../lib/prisma"));
const notificationFilters_1 = require("../utils/notificationFilters");
const getNotifications = async (req, res, next) => {
    try {
        const userId = req.user?.id;
        if (!userId) {
            return res.status(401).json({ error: 'Unauthorized' });
        }
        const scope = (0, notificationFilters_1.getNotificationScope)(req.query.scope);
        const status = (0, notificationFilters_1.getNotificationStatus)(req.query.status);
        const notifications = await prisma_1.default.notification.findMany({
            where: (0, notificationFilters_1.buildNotificationWhereClause)(userId, { scope, status }),
            orderBy: { createdAt: 'desc' },
            take: 50,
        });
        res.status(200).json({ success: true, data: notifications });
    }
    catch (error) {
        next(error);
    }
};
exports.getNotifications = getNotifications;
const markAsRead = async (req, res, next) => {
    try {
        const userId = req.user?.id;
        const notificationId = typeof req.params.id === 'string' ? req.params.id : '';
        if (!userId)
            return res.status(401).json({ error: 'Unauthorized' });
        if (!notificationId)
            return res.status(400).json({ error: 'Notification id is required' });
        const notification = await prisma_1.default.notification.findFirst({
            where: { id: notificationId, userId },
        });
        if (!notification) {
            return res.status(404).json({ error: 'Notification not found' });
        }
        await prisma_1.default.notification.update({
            where: { id: notificationId },
            data: { isRead: true },
        });
        res.status(200).json({ success: true });
    }
    catch (error) {
        next(error);
    }
};
exports.markAsRead = markAsRead;
const markAllAsRead = async (req, res, next) => {
    try {
        const userId = req.user?.id;
        if (!userId)
            return res.status(401).json({ error: 'Unauthorized' });
        const scope = (0, notificationFilters_1.getNotificationScope)(req.query.scope);
        await prisma_1.default.notification.updateMany({
            where: (0, notificationFilters_1.buildNotificationWhereClause)(userId, { scope, status: 'unread' }),
            data: { isRead: true },
        });
        res.status(200).json({ success: true });
    }
    catch (error) {
        next(error);
    }
};
exports.markAllAsRead = markAllAsRead;
//# sourceMappingURL=notification.controller.js.map