import type { Prisma } from '@prisma/client';

export const vehicleNotificationTypes = new Set(['NEW_LISTING', 'LISTING_UPDATE', 'PAYMENT_VERIFIED', 'PAYMENT_REJECTED', 'PAYMENT_SUBMITTED']);

export type NotificationScope = 'all' | 'vehicle';
export type NotificationStatus = 'all' | 'unread' | 'read';

export const getNotificationScope = (value?: unknown): NotificationScope => {
  if (typeof value !== 'string') {
    return 'all';
  }

  const normalized = value.trim().toLowerCase();
  return normalized === 'vehicle' ? 'vehicle' : 'all';
};

export const getNotificationStatus = (value?: unknown): NotificationStatus => {
  if (typeof value !== 'string') {
    return 'all';
  }

  const normalized = value.trim().toLowerCase();
  if (normalized === 'unread') return 'unread';
  if (normalized === 'read') return 'read';
  return 'all';
};

type BuildNotificationWhereClauseOptions = {
  scope?: NotificationScope;
  status?: NotificationStatus;
  search?: string;
};

export const buildNotificationWhereClause = (
  userId: string,
  options: BuildNotificationWhereClauseOptions,
): Prisma.NotificationWhereInput => {
  const scope = options.scope ?? 'all';
  const status = options.status ?? 'all';
  const search = options.search?.trim();

  return {
    userId,
    ...(status === 'unread' ? { isRead: false } : {}),
    ...(status === 'read' ? { isRead: true } : {}),
    ...(scope === 'vehicle'
      ? {
          type: {
            in: Array.from(vehicleNotificationTypes),
          },
        }
      : {}),
    ...(search
      ? {
          OR: [
            { title: { contains: search, mode: 'insensitive' } },
            { message: { contains: search, mode: 'insensitive' } },
          ],
        }
      : {}),
  };
};
