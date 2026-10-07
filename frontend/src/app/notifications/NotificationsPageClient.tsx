"use client";

import React, { useEffect } from 'react';
import { useAuthStore } from '@/store/authStore';
import { useNotificationStore } from '@/store/notificationStore';
import { useTranslation } from '@/hooks/useTranslation';
import { Package, BellOff } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { formatDateTime } from '@/lib/i18n/formatters';
import { getNotificationHref } from '@/lib/notificationNavigation';

export default function NotificationsPageClient() {
  const { t, locale } = useTranslation();
  const { isAuthenticated } = useAuthStore();
  const router = useRouter();
  const { notifications, fetchNotifications, markNotificationAsRead, markAllNotificationsAsRead } = useNotificationStore();

  useEffect(() => {
    if (!isAuthenticated) {
      router.push('/');
      return;
    }

    void fetchNotifications('unread');
  }, [fetchNotifications, isAuthenticated, router]);

  const handleNotificationClick = (event: React.MouseEvent<HTMLAnchorElement>, notification: { id: string; link?: string | null }) => {
    event.preventDefault();
    void markNotificationAsRead(notification.id);
    router.push(getNotificationHref(notification.link));
  };

  if (!isAuthenticated) return null;

  return (
    <div className="min-h-screen bg-[#F8F9FA] pb-24 pt-4 overflow-y-auto [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden">
      <div className="max-w-2xl mx-auto px-3 sm:px-4">
        {/* Top Header Card */}
        <div className="flex items-center justify-between mb-4 bg-white p-4 rounded-2xl border border-gray-100 shadow-sm">
          <div className="flex items-center gap-2.5">
            <h1 className="text-base sm:text-lg font-extrabold text-gray-900">
              {t('common.notifications') || 'Notifications'}
            </h1>
            {notifications.length > 0 && (
              <span className="flex h-5 min-w-[20px] items-center justify-center rounded-full bg-jcb-yellow px-2 text-xs font-black text-black shadow-xs">
                {notifications.length}
              </span>
            )}
          </div>

          {notifications.length > 0 && (
            <button
              type="button"
              onClick={() => void markAllNotificationsAsRead()}
              className="text-xs font-bold text-[#9A7600] hover:text-[#7A5F00] active:scale-95 transition-all"
            >
              {t('common.markAllRead') || 'Mark all read'}
            </button>
          )}
        </div>

        {/* Notifications List as Standalone Cards */}
        {notifications.length === 0 ? (
          <div className="p-12 text-center text-sm text-gray-500 flex flex-col items-center justify-center bg-white rounded-2xl border border-gray-100 shadow-xs my-6">
            <div className="h-14 w-14 rounded-full bg-amber-50 text-amber-500 flex items-center justify-center mb-3 shadow-inner">
              <BellOff className="h-7 w-7" />
            </div>
            <p className="font-bold text-gray-800 text-base">{t('common.noNotifications') || 'No Notifications'}</p>
            <p className="text-xs text-gray-400 mt-1">You are all caught up! New notifications will appear here.</p>
          </div>
        ) : (
          <div className="flex flex-col gap-3 [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden">
            {notifications.map((notification) => (
              <Link
                href={getNotificationHref(notification.link)}
                key={notification.id}
                onClick={(event) => handleNotificationClick(event, notification)}
                className="group relative flex items-start gap-3.5 p-4 rounded-2xl border border-amber-200/80 bg-gradient-to-r from-[#FFFBF0] via-[#FFF9E6] to-[#FFF6D6]/50 shadow-sm hover:shadow-md hover:border-amber-300 transition-all active:scale-[0.99] overflow-hidden"
              >
                {/* Icon box */}
                <div className="mt-0.5 flex h-10 w-10 sm:h-11 sm:w-11 flex-shrink-0 items-center justify-center rounded-2xl bg-[#FFF0C2] text-[#9A7600] shadow-xs group-hover:scale-105 transition-transform">
                  <Package size={20} className="sm:h-5 sm:w-5" />
                </div>

                {/* Content */}
                <div className="flex-1 min-w-0 pr-4">
                  <p className="text-xs sm:text-sm font-bold text-gray-900 line-clamp-1 leading-snug">
                    {notification.title}
                  </p>
                  <p className="mt-1 text-xs text-gray-600 line-clamp-2 leading-normal">
                    {notification.message}
                  </p>
                  <p className="mt-2 text-[10px] font-semibold text-gray-400">
                    {formatDateTime(notification.createdAt, locale)}
                  </p>
                </div>

                {/* Orange/Yellow Unread Badge Dot */}
                <span className="absolute top-4 right-4 h-2.5 w-2.5 rounded-full bg-amber-500 ring-4 ring-amber-100" />
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
