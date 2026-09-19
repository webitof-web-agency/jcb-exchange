"use client";

import React, { useEffect } from 'react';
import { useAuthStore } from '@/store/authStore';
import { useNotificationStore } from '@/store/notificationStore';
import { useTranslation } from '@/hooks/useTranslation';
import { Package, ArrowLeft } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { formatDateTime } from '@/lib/i18n/formatters';

export default function NotificationsPageClient() {
  const { t, locale } = useTranslation();
  const { isAuthenticated } = useAuthStore();
  const router = useRouter();
  const { notifications, markNotificationAsRead, markAllNotificationsAsRead } = useNotificationStore();

  useEffect(() => {
    if (!isAuthenticated) {
      router.push('/');
    }
  }, [isAuthenticated, router]);

  if (!isAuthenticated) return null;

  return (
    <div className="min-h-screen bg-gray-50 pb-20">
      <div className="max-w-3xl mx-auto mt-4 sm:mt-6 px-2 sm:px-4">
        {notifications.length > 0 && (
          <div className="flex justify-end mb-3">
            <button
              onClick={() => markAllNotificationsAsRead()}
              className="text-xs sm:text-sm font-semibold text-jcb-yellow hover:underline"
            >
              {t('common.markAllRead') || 'Mark all read'}
            </button>
          </div>
        )}
        {notifications.length === 0 ? (
          <div className="p-10 text-center text-sm text-gray-500 flex flex-col items-center">
            <Package className="mb-4 h-12 w-12 opacity-20" />
            {t('common.noNotifications') || 'No notifications'}
          </div>
        ) : (
          <div className="bg-white sm:rounded-lg shadow-sm overflow-hidden border border-gray-100">
            {notifications.map((notification) => (
              <Link
                href={notification.link || '/machines'}
                key={notification.id}
                onClick={() => markNotificationAsRead(notification.id)}
                className="flex items-start gap-4 border-b border-gray-100 p-4 transition-colors hover:bg-gray-50 bg-[#FFF9E6] last:border-0"
              >
                <div className="mt-1 flex h-10 w-10 sm:h-12 sm:w-12 flex-shrink-0 items-center justify-center rounded-full bg-[#FFF3CD] text-[#9A7600]">
                  <Package size={18} className="sm:h-5 sm:w-5" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-bold text-gray-900 line-clamp-1">{notification.title}</p>
                  <p className="mt-1 text-xs text-gray-600 line-clamp-2">{notification.message}</p>
                  <div className="mt-2 text-[10px] text-gray-400">
                    {formatDateTime(notification.createdAt, locale)}
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
