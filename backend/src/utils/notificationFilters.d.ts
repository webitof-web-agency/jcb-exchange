import type { Prisma } from '@prisma/client';
export declare const vehicleNotificationTypes: Set<string>;
export type NotificationScope = 'all' | 'vehicle';
export type NotificationStatus = 'all' | 'unread';
export declare const getNotificationScope: (value?: unknown) => NotificationScope;
export declare const getNotificationStatus: (value?: unknown) => NotificationStatus;
type BuildNotificationWhereClauseOptions = {
    scope?: NotificationScope;
    status?: NotificationStatus;
};
export declare const buildNotificationWhereClause: (userId: string, options: BuildNotificationWhereClauseOptions) => Prisma.NotificationWhereInput;
export {};
//# sourceMappingURL=notificationFilters.d.ts.map