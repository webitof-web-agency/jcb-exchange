'use client';

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import api from '@/lib/api';
import { useTranslation } from '@/hooks/useTranslation';
import { formatDateTime } from '@/lib/i18n/formatters';
import {
  Bell,
  CheckCheck,
  Check,
  Trash2,
  RotateCw,
  Search,
  ExternalLink,
  Clock,
  ShieldCheck,
  Truck,
  CreditCard,
  MessageCircle,
  Inbox,
  X,
  Filter,
  CheckCircle2,
  AlertCircle,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';

export interface NotificationItem {
  id: string;
  userId: string;
  title: string;
  message: string;
  type: string | null;
  isRead: boolean;
  link: string | null;
  createdAt: string;
}

interface NotificationMeta {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
  unreadCount: number;
}

interface NotificationCenterProps {
  portal?: 'partner' | 'admin' | 'employee' | 'superadmin';
}

function formatRelativeTime(dateStr: string): string {
  try {
    const date = new Date(dateStr);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffSec = Math.floor(diffMs / 1000);
    const diffMin = Math.floor(diffSec / 60);
    const diffHr = Math.floor(diffMin / 60);
    const diffDay = Math.floor(diffHr / 24);

    if (diffSec < 60) return 'Just now';
    if (diffMin < 60) return `${diffMin}m ago`;
    if (diffHr < 24) return `${diffHr}h ago`;
    if (diffDay === 1) return 'Yesterday';
    if (diffDay < 7) return `${diffDay}d ago`;
    return date.toLocaleDateString('en-IN', { day: '2-digit', month: 'short' });
  } catch {
    return dateStr;
  }
}

function getNotificationCategory(notif: NotificationItem): {
  icon: React.ElementType;
  color: string;
  bgColor: string;
  borderColor: string;
  badgeLabel: string;
} {
  const type = (notif.type || '').toUpperCase();
  const title = (notif.title || '').toLowerCase();
  const message = (notif.message || '').toLowerCase();

  if (
    type.includes('KYC') ||
    type.includes('ONBOARD') ||
    type.includes('VERIF') ||
    title.includes('kyc') ||
    title.includes('onboarding') ||
    title.includes('verified') ||
    message.includes('kyc') ||
    message.includes('pan') ||
    message.includes('aadhaar') ||
    message.includes('gst')
  ) {
    return {
      icon: ShieldCheck,
      color: 'text-emerald-600',
      bgColor: 'bg-emerald-50',
      borderColor: 'border-emerald-200',
      badgeLabel: 'Verification',
    };
  }

  if (
    type.includes('PAYMENT') ||
    type.includes('DEPOSIT') ||
    title.includes('payment') ||
    title.includes('deposit') ||
    message.includes('payment') ||
    message.includes('amount') ||
    message.includes('rupee') ||
    message.includes('receipt')
  ) {
    return {
      icon: CreditCard,
      color: 'text-indigo-600',
      bgColor: 'bg-indigo-50',
      borderColor: 'border-indigo-200',
      badgeLabel: 'Finance',
    };
  }

  if (
    type.includes('LISTING') ||
    type.includes('VEHICLE') ||
    title.includes('listing') ||
    title.includes('vehicle') ||
    message.includes('listing') ||
    message.includes('jcb') ||
    message.includes('equipment')
  ) {
    return {
      icon: Truck,
      color: 'text-amber-600',
      bgColor: 'bg-amber-50',
      borderColor: 'border-amber-200',
      badgeLabel: 'Listing',
    };
  }

  if (
    type.includes('LEAD') ||
    type.includes('ENQUIRY') ||
    type.includes('CRM') ||
    title.includes('lead') ||
    title.includes('enquiry') ||
    message.includes('buyer') ||
    message.includes('contact')
  ) {
    return {
      icon: MessageCircle,
      color: 'text-purple-600',
      bgColor: 'bg-purple-50',
      borderColor: 'border-purple-200',
      badgeLabel: 'Inquiry',
    };
  }

  return {
    icon: Bell,
    color: 'text-slate-600',
    bgColor: 'bg-slate-100',
    borderColor: 'border-slate-200',
    badgeLabel: 'System',
  };
}

export default function NotificationCenter({ portal = 'partner' }: NotificationCenterProps) {
  const router = useRouter();
  const { t, locale } = useTranslation();

  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [meta, setMeta] = useState<NotificationMeta>({
    page: 1,
    limit: 20,
    total: 0,
    totalPages: 1,
    unreadCount: 0,
  });

  const [statusFilter, setStatusFilter] = useState<'all' | 'unread' | 'read'>('all');
  const [typeFilter, setTypeFilter] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [actionInProgress, setActionInProgress] = useState<string | null>(null);
  const [showClearConfirm, setShowClearConfirm] = useState(false);

  // Debounce search input
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(searchQuery);
    }, 300);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  const fetchNotifications = useCallback(
    async (pageToLoad = 1, showRefreshSpinner = false) => {
      if (showRefreshSpinner) {
        setRefreshing(true);
      } else {
        setLoading(true);
      }

      try {
        const params = new URLSearchParams();
        params.set('page', String(pageToLoad));
        params.set('limit', String(meta.limit));
        if (statusFilter !== 'all') {
          params.set('status', statusFilter);
        }
        if (debouncedSearch.trim()) {
          params.set('search', debouncedSearch.trim());
        }

        const res = await api.get(`/notifications?${params.toString()}`);
        if (res.data?.success && Array.isArray(res.data.data)) {
          setNotifications(res.data.data);
          if (res.data.meta) {
            setMeta(res.data.meta);
          } else {
            const count = res.data.data.length;
            const unread = res.data.data.filter((n: NotificationItem) => !n.isRead).length;
            setMeta({
              page: pageToLoad,
              limit: 20,
              total: count,
              totalPages: Math.max(1, Math.ceil(count / 20)),
              unreadCount: unread,
            });
          }
        }
      } catch (err) {
        console.error('Failed to fetch notifications:', err);
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [statusFilter, debouncedSearch, meta.limit]
  );

  useEffect(() => {
    fetchNotifications(1);
  }, [fetchNotifications]);

  const handleMarkAsRead = async (id: string, link?: string | null) => {
    setActionInProgress(id);
    try {
      await api.put(`/notifications/${id}/read`);
      setNotifications((prev) =>
        prev.map((n) => (n.id === id ? { ...n, isRead: true } : n))
      );
      setMeta((prev) => ({
        ...prev,
        unreadCount: Math.max(0, prev.unreadCount - 1),
      }));

      if (link) {
        router.push(link);
      }
    } catch (err) {
      console.error('Failed to mark notification as read:', err);
    } finally {
      setActionInProgress(null);
    }
  };

  const handleMarkAllAsRead = async () => {
    setActionInProgress('mark-all');
    try {
      await api.put('/notifications/read-all');
      setNotifications((prev) => prev.map((n) => ({ ...n, isRead: true })));
      setMeta((prev) => ({ ...prev, unreadCount: 0 }));
    } catch (err) {
      console.error('Failed to mark all as read:', err);
    } finally {
      setActionInProgress(null);
    }
  };

  const handleDelete = async (id: string) => {
    setActionInProgress(`delete-${id}`);
    try {
      await api.delete(`/notifications/${id}`);
      setNotifications((prev) => prev.filter((n) => n.id !== id));
      setMeta((prev) => ({
        ...prev,
        total: Math.max(0, prev.total - 1),
      }));
    } catch (err) {
      console.error('Failed to delete notification:', err);
    } finally {
      setActionInProgress(null);
    }
  };

  const handleClearAll = async () => {
    setActionInProgress('clear-all');
    setShowClearConfirm(false);
    try {
      await api.delete('/notifications');
      setNotifications([]);
      setMeta((prev) => ({
        ...prev,
        total: 0,
        unreadCount: 0,
        totalPages: 1,
      }));
    } catch (err) {
      console.error('Failed to clear notifications:', err);
    } finally {
      setActionInProgress(null);
    }
  };

  // Filter client-side by category if requested
  const filteredNotifications = useMemo(() => {
    if (typeFilter === 'all') return notifications;
    return notifications.filter((notif) => {
      const cat = getNotificationCategory(notif);
      return cat.badgeLabel.toLowerCase() === typeFilter.toLowerCase();
    });
  }, [notifications, typeFilter]);

  const categoriesAvailable = ['all', 'Verification', 'Listing', 'Finance', 'Inquiry', 'System'];

  return (
    <div className="space-y-4 max-w-5xl mx-auto pb-12">
      {/* Top Banner / Breadcrumb Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white p-4 sm:p-5 rounded-2xl border border-slate-200 shadow-2xs">
        <div className="flex items-center gap-3.5">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-amber-500/10 text-amber-600 border border-amber-500/20">
            <Bell className="h-5 w-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-base sm:text-lg font-bold text-slate-900 tracking-tight">
                {t('common.notifications', 'Notification Center')}
              </h1>
              {meta.unreadCount > 0 && (
                <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-red-100 text-red-700 border border-red-200">
                  {meta.unreadCount} Unread
                </span>
              )}
            </div>
            <p className="text-xs text-slate-500 mt-0.5">
              Review platform alerts, KYC verification status, inventory updates, and inquiries.
            </p>
          </div>
        </div>

        {/* Global Action Buttons */}
        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={() => fetchNotifications(meta.page, true)}
            disabled={loading || refreshing}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-slate-600 hover:text-slate-900 bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded-xl transition-all shadow-2xs disabled:opacity-50"
            title="Refresh notifications"
          >
            <RotateCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin text-amber-600' : ''}`} />
            <span className="hidden sm:inline">Refresh</span>
          </button>

          {meta.unreadCount > 0 && (
            <button
              type="button"
              onClick={handleMarkAllAsRead}
              disabled={actionInProgress === 'mark-all'}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-slate-950 bg-[#FFC107] hover:bg-[#E5AD06] rounded-xl transition-all shadow-xs disabled:opacity-50"
            >
              <CheckCheck className="w-3.5 h-3.5" />
              <span>Mark All Read</span>
            </button>
          )}

          {notifications.length > 0 && (
            <button
              type="button"
              onClick={() => setShowClearConfirm(true)}
              className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-semibold text-rose-600 hover:text-rose-700 hover:bg-rose-50 border border-rose-200/80 rounded-xl transition-all"
              title="Clear all notifications"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span className="hidden md:inline">Clear All</span>
            </button>
          )}
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 bg-white p-3 sm:p-3.5 rounded-xl border border-slate-200 shadow-2xs">
        {/* Status Tabs */}
        <div className="flex items-center gap-1 bg-slate-100/80 p-1 rounded-xl">
          <button
            type="button"
            onClick={() => setStatusFilter('all')}
            className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-all ${
              statusFilter === 'all'
                ? 'bg-white text-slate-900 shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            All <span className="ml-1 text-[10px] text-slate-400">({meta.total})</span>
          </button>
          <button
            type="button"
            onClick={() => setStatusFilter('unread')}
            className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-all flex items-center gap-1.5 ${
              statusFilter === 'unread'
                ? 'bg-white text-slate-900 shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Unread
            {meta.unreadCount > 0 && (
              <span className="h-2 w-2 rounded-full bg-red-500 animate-pulse" />
            )}
          </button>
          <button
            type="button"
            onClick={() => setStatusFilter('read')}
            className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-all ${
              statusFilter === 'read'
                ? 'bg-white text-slate-900 shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Read
          </button>
        </div>

        {/* Search input & category chips */}
        <div className="flex items-center gap-2 flex-1 max-w-md">
          <div className="relative flex-1">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search in notifications..."
              className="w-full pl-9 pr-8 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:outline-none focus:ring-2 focus:ring-amber-400/30 focus:border-amber-400 transition-all placeholder:text-slate-400"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 p-0.5"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          {/* Category Dropdown */}
          <div className="shrink-0">
            <select
              value={typeFilter}
              onChange={(e) => setTypeFilter(e.target.value)}
              className="px-2.5 py-1.5 text-xs font-semibold text-slate-700 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-amber-400/30 transition-all cursor-pointer"
            >
              {categoriesAvailable.map((c) => (
                <option key={c} value={c}>
                  {c === 'all' ? 'All Types' : c}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Main Content Area */}
      {loading ? (
        <div className="bg-white rounded-2xl border border-slate-200 p-8 space-y-3">
          {[1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="animate-pulse flex items-start gap-3.5 p-4 rounded-xl bg-slate-50/70 border border-slate-100">
              <div className="h-10 w-10 rounded-xl bg-slate-200 shrink-0" />
              <div className="flex-1 space-y-2">
                <div className="h-4 bg-slate-200 rounded w-1/3" />
                <div className="h-3 bg-slate-200 rounded w-3/4" />
                <div className="h-2.5 bg-slate-200 rounded w-20" />
              </div>
            </div>
          ))}
        </div>
      ) : filteredNotifications.length === 0 ? (
        <div className="bg-white rounded-2xl border border-slate-200 p-12 text-center">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-amber-50 text-amber-600 border border-amber-200/80 mb-3.5">
            <Inbox className="h-7 w-7 text-amber-500" />
          </div>
          <h3 className="text-sm font-bold text-slate-900">
            {statusFilter === 'unread'
              ? "You're all caught up!"
              : searchQuery
                ? 'No matching notifications found'
                : 'No notifications yet'}
          </h3>
          <p className="text-xs text-slate-500 mt-1 max-w-sm mx-auto">
            {statusFilter === 'unread'
              ? 'There are no pending unread notifications in your inbox.'
              : searchQuery
                ? `No notifications matched "${searchQuery}". Try searching with different keywords.`
                : 'Any updates about your KYC status, vehicle inquiries, and transactions will appear here.'}
          </p>
          {(statusFilter !== 'all' || searchQuery) && (
            <button
              type="button"
              onClick={() => {
                setStatusFilter('all');
                setTypeFilter('all');
                setSearchQuery('');
              }}
              className="mt-4 inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-amber-700 bg-amber-50 hover:bg-amber-100 border border-amber-200 rounded-xl transition-all"
            >
              <span>Reset all filters</span>
            </button>
          )}
        </div>
      ) : (
        <div className="space-y-2">
          {filteredNotifications.map((notif) => {
            const cat = getNotificationCategory(notif);
            const CategoryIcon = cat.icon;
            const isUnread = !notif.isRead;

            return (
              <div
                key={notif.id}
                className={`group relative flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3.5 sm:p-4 rounded-xl border transition-all duration-150 ${
                  isUnread
                    ? 'bg-amber-50/20 border-amber-300/80 border-l-[4px] border-l-amber-500 shadow-2xs hover:bg-amber-50/35 hover:shadow-xs'
                    : 'bg-white border-slate-200/90 hover:border-slate-300 hover:bg-slate-50/70 shadow-2xs'
                }`}
              >
                {/* Left: Category Icon + Content */}
                <div className="flex items-start gap-3.5 min-w-0 flex-1">
                  <div
                    className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border ${cat.bgColor} ${cat.color} ${cat.borderColor} shadow-2xs`}
                  >
                    <CategoryIcon className="h-5 w-5" />
                  </div>

                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span
                        className={`inline-flex items-center px-1.5 py-0.2 rounded text-[9px] font-bold tracking-wider uppercase ${cat.bgColor} ${cat.color} border ${cat.borderColor}`}
                      >
                        {cat.badgeLabel}
                      </span>
                      <h4
                        className={`text-xs sm:text-sm font-bold text-slate-900 tracking-tight leading-tight ${
                          isUnread ? 'text-slate-950' : 'text-slate-800'
                        }`}
                      >
                        {notif.title}
                      </h4>
                      {isUnread && (
                        <span className="inline-flex items-center gap-1 px-1.5 py-0.2 rounded text-[9px] font-black uppercase tracking-wider bg-amber-500 text-slate-950 shadow-2xs">
                          <span className="h-1.5 w-1.5 rounded-full bg-slate-950 animate-ping" />
                          New
                        </span>
                      )}
                    </div>

                    <p className="mt-1 text-xs text-slate-600 leading-relaxed break-words">
                      {notif.message}
                    </p>

                    <div className="mt-2 flex items-center gap-3 text-[11px] text-slate-400">
                      <span className="flex items-center gap-1 font-medium text-slate-500">
                        <Clock className="w-3 h-3 text-slate-400" />
                        {formatRelativeTime(notif.createdAt)}
                      </span>
                      <span>•</span>
                      <span>{formatDateTime(notif.createdAt, locale)}</span>
                    </div>
                  </div>
                </div>

                {/* Right: Actions */}
                <div className="flex items-center gap-2 shrink-0 sm:self-center pt-2 sm:pt-0 border-t sm:border-t-0 border-slate-100 justify-end">
                  {notif.link && (
                    <button
                      type="button"
                      onClick={() => handleMarkAsRead(notif.id, notif.link)}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-slate-800 bg-slate-100 hover:bg-amber-100/80 hover:text-amber-950 border border-slate-200/80 hover:border-amber-300 rounded-lg transition-all"
                    >
                      <span>View</span>
                      <ExternalLink className="w-3.5 h-3.5" />
                    </button>
                  )}

                  {isUnread && (
                    <button
                      type="button"
                      onClick={() => handleMarkAsRead(notif.id)}
                      disabled={actionInProgress === notif.id}
                      className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-amber-700 hover:text-amber-900 hover:bg-amber-50 border border-amber-200/60 rounded-lg transition-all"
                      title="Mark as read"
                    >
                      <Check className="w-3.5 h-3.5" />
                      <span className="hidden sm:inline">Mark Read</span>
                    </button>
                  )}

                  <button
                    type="button"
                    onClick={() => handleDelete(notif.id)}
                    disabled={actionInProgress === `delete-${notif.id}`}
                    className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-all"
                    title="Delete notification"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Pagination Bar */}
      {meta.totalPages > 1 && (
        <div className="flex items-center justify-between p-3.5 bg-white border border-slate-200 rounded-xl shadow-2xs">
          <p className="text-xs text-slate-500">
            Showing Page <span className="font-bold text-slate-800">{meta.page}</span> of{' '}
            <span className="font-bold text-slate-800">{meta.totalPages}</span>
          </p>
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              disabled={meta.page <= 1 || loading}
              onClick={() => fetchNotifications(meta.page - 1)}
              className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-semibold text-slate-700 bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded-lg transition-colors disabled:opacity-40"
            >
              <ChevronLeft className="w-3.5 h-3.5" />
              Previous
            </button>
            <button
              type="button"
              disabled={meta.page >= meta.totalPages || loading}
              onClick={() => fetchNotifications(meta.page + 1)}
              className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-semibold text-slate-700 bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded-lg transition-colors disabled:opacity-40"
            >
              Next
              <ChevronRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      )}

      {/* Clear All Confirmation Modal */}
      {showClearConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-xs p-4 animate-in fade-in duration-150">
          <div className="w-full max-w-sm bg-white rounded-2xl border border-slate-200 p-5 shadow-2xl space-y-4">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-rose-50 text-rose-600 border border-rose-200">
                <AlertCircle className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-slate-900">Clear All Notifications?</h3>
                <p className="text-xs text-slate-500 mt-0.5">This action will delete all your notifications.</p>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setShowClearConfirm(false)}
                className="px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-100 rounded-xl transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleClearAll}
                disabled={actionInProgress === 'clear-all'}
                className="px-3.5 py-1.5 text-xs font-bold text-white bg-rose-600 hover:bg-rose-700 rounded-xl transition-colors shadow-xs"
              >
                Confirm Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
