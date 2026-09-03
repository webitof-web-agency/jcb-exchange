import { Request, Response, NextFunction } from 'express';
import prisma from '../lib/prisma';
import { PushNotificationService } from '../services/pushNotification.service';
import {
  buildNotificationWhereClause,
  getNotificationScope,
  getNotificationStatus,
} from '../utils/notificationFilters';
import { isPushSubscriptionPayload } from '../utils/pushSubscriptions';

export const getNotifications = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const scope = getNotificationScope(req.query.scope);
    const status = getNotificationStatus(req.query.status);

    const notifications = await prisma.notification.findMany({
      where: buildNotificationWhereClause(userId, { scope, status }),
      orderBy: { createdAt: 'desc' },
      take: 50,
    });

    res.status(200).json({ success: true, data: notifications });
  } catch (error) {
    next(error);
  }
};

export const getPushConfig = async (req: Request, res: Response, next: NextFunction) => {
  try {
    res.status(200).json({
      success: true,
      data: PushNotificationService.getPublicConfig(),
    });
  } catch (error) {
    next(error);
  }
};

export const markAsRead = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = req.user?.id;
    const notificationId = typeof req.params.id === 'string' ? req.params.id : '';
    
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });
    if (!notificationId) return res.status(400).json({ error: 'Notification id is required' });

    const notification = await prisma.notification.findFirst({
      where: { id: notificationId, userId },
    });

    if (!notification) {
      return res.status(404).json({ error: 'Notification not found' });
    }

    await prisma.notification.update({
      where: { id: notificationId },
      data: { isRead: true },
    });

    res.status(200).json({ success: true });
  } catch (error) {
    next(error);
  }
};

export const markAllAsRead = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });

    const scope = getNotificationScope(req.query.scope);

    await prisma.notification.updateMany({
      where: buildNotificationWhereClause(userId, { scope, status: 'unread' }),
      data: { isRead: true },
    });

    res.status(200).json({ success: true });
  } catch (error) {
    next(error);
  }
};

export const savePushSubscription = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });

    const subscription = req.body;
    if (!isPushSubscriptionPayload(subscription)) {
      return res.status(400).json({ error: 'Invalid subscription object' });
    }

    await PushNotificationService.saveSubscription(userId, subscription);

    res.status(200).json({ success: true, message: 'Subscription saved successfully' });
  } catch (error) {
    next(error);
  }
};

export const saveFcmToken = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });

    const { token } = req.body;
    const fcmTokenToSave = typeof token === 'string' && token.trim().length > 0 ? token.trim() : null;

    await PushNotificationService.saveFcmToken(userId, fcmTokenToSave);

    res.status(200).json({
      success: true,
      message: fcmTokenToSave ? 'FCM token saved successfully' : 'FCM token cleared successfully',
    });
  } catch (error) {
    next(error);
  }
};
