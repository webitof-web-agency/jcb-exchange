import { create } from 'zustand';
import api from '@/lib/api';

export interface PublicNotification {
  id: string;
  title: string;
  price: number;
  locationCity: string;
  locationState: string;
  status: string;
  categoryName: string;
  brandName: string;
  partnerName: string;
  featuredImage: string | null;
  createdAt: string;
  updatedAt?: string;
}

export interface UserNotification {
  id: string;
  title: string;
  message: string;
  type?: string | null;
  isRead: boolean;
  link?: string | null;
  createdAt: string;
}

interface NotificationState {
  recentListings: PublicNotification[];
  notifications: UserNotification[];
  lastSeenTimestamp: number;
  unreadCount: number;
  fetchRecentListings: () => Promise<void>;
  fetchNotifications: () => Promise<void>;
  markNotificationAsRead: (id: string) => Promise<void>;
  markAllNotificationsAsRead: () => Promise<void>;
  markAsSeen: () => void;
  initialize: () => void;
}

export const useNotificationStore = create<NotificationState>((set, get) => ({
  recentListings: [],
  notifications: [],
  lastSeenTimestamp: 0,
  unreadCount: 0,

  initialize: () => {
    // Load last seen from local storage on mount
    if (typeof window !== 'undefined') {
      const stored = localStorage.getItem('lastSeenPublicNotification');
      if (stored) {
        set({ lastSeenTimestamp: parseInt(stored, 10) });
      } else {
        // If first time visiting, set it to now so they don't get overwhelmed with old notifications
        const now = Date.now();
        localStorage.setItem('lastSeenPublicNotification', now.toString());
        set({ lastSeenTimestamp: now });
      }
    }
  },

  fetchRecentListings: async () => {
    try {
      const res = await api.get('/master/recent-listings');
      if (res.data?.success) {
        const listings = res.data.data;
        set({
          recentListings: listings,
        });
      }
    } catch {
      set({
        recentListings: [],
      });
    }
  },

  fetchNotifications: async () => {
    try {
      const res = await api.get<{ success: boolean; data: UserNotification[] }>('/notifications', {
        params: { status: 'unread' },
      });
      const notifications = res.data?.data || [];

      set({
        notifications,
        unreadCount: notifications.length,
      });
    } catch {
      set({
        notifications: [],
        unreadCount: 0,
      });
    }
  },

  markNotificationAsRead: async (id: string) => {
    const previousNotifications = get().notifications;
    const nextNotifications = previousNotifications.filter((item) => item.id !== id);

    set({
      notifications: nextNotifications,
      unreadCount: nextNotifications.length,
    });

    try {
      await api.put(`/notifications/${id}/read`);
    } catch {
      set({
        notifications: previousNotifications,
        unreadCount: previousNotifications.length,
      });
    }
  },

  markAllNotificationsAsRead: async () => {
    const previousNotifications = get().notifications;

    set({
      notifications: [],
      unreadCount: 0,
    });

    try {
      await api.put('/notifications/read-all');
    } catch {
      set({
        notifications: previousNotifications,
        unreadCount: previousNotifications.length,
      });
    }
  },

  markAsSeen: () => {
    const now = Date.now();
    if (typeof window !== 'undefined') {
      localStorage.setItem('lastSeenPublicNotification', now.toString());
    }
    set({ lastSeenTimestamp: now, unreadCount: 0 });
  }
}));
