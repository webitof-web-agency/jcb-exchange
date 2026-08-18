import { Request, Response, NextFunction } from 'express';
import prisma from '../lib/prisma';

const vehicleNotificationTypes = new Set(['NEW_LISTING', 'LISTING_UPDATE']);

const getNotificationScope = (value?: unknown) => {
  if (typeof value !== 'string') {
    return 'all';
  }

  const normalized = value.trim().toLowerCase();
  return normalized === 'vehicle' ? 'vehicle' : 'all';
};

export const getNotifications = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const scope = getNotificationScope(req.query.scope);

    const notifications = await prisma.notification.findMany({
      where: {
        userId,
        ...(scope === 'vehicle'
          ? {
              type: {
                in: Array.from(vehicleNotificationTypes),
              },
            }
          : {}),
      },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });

    res.status(200).json({ success: true, data: notifications });
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
      where: {
        userId,
        isRead: false,
        ...(scope === 'vehicle'
          ? {
              type: {
                in: Array.from(vehicleNotificationTypes),
              },
            }
          : {}),
      },
      data: { isRead: true },
    });

    res.status(200).json({ success: true });
  } catch (error) {
    next(error);
  }
};
