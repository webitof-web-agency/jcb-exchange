import type { Prisma } from '@prisma/client';

export const vehicleNotificationTypes = new Set(['NEW_LISTING', 'LISTING_UPDATE']);

export type NotificationScope = 'all' | 'vehicle';
export type NotificationStatus = 'all' | 'unread';

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
  return normalized === 'unread' ? 'unread' : 'all';
};

type BuildNotificationWhereClauseOptions = {
  scope?: NotificationScope;
  status?: NotificationStatus;
};

export const buildNotificationWhereClause = (
  userId: string,
  options: BuildNotificationWhereClauseOptions,
): Prisma.NotificationWhereInput => {
  const scope = options.scope ?? 'all';
  const status = options.status ?? 'all';

  return {
    userId,
    ...(status === 'unread' ? { isRead: false } : {}),
    ...(scope === 'vehicle'
      ? {
          type: {
            in: Array.from(vehicleNotificationTypes),
          },
        }
      : {}),
  };
};
