'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import api, { API_BASE_URL } from '@/lib/api';

export interface RealtimeNotificationItem {
  id: string;
  userId: string;
  title: string;
  message: string;
  type: string | null;
  isRead: boolean;
  link: string | null;
  createdAt: string;
}

type UseRealtimeNotificationsOptions = {
  enabled: boolean;
  token: string | null;
};

const sortNewestFirst = (items: RealtimeNotificationItem[]) =>
  [...items].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

const parseEventBlock = (block: string) => {
  let event = '';
  const data: string[] = [];
  for (const line of block.split('\n')) {
    if (line.startsWith('event:')) event = line.slice(6).trim();
    if (line.startsWith('data:')) data.push(line.slice(5).trim());
  }
  return { event, data: data.join('\n') };
};

export const useRealtimeNotifications = ({ enabled, token }: UseRealtimeNotificationsOptions) => {
  const [notifications, setNotifications] = useState<RealtimeNotificationItem[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const seenIds = useRef(new Set<string>());

  const refresh = useCallback(async () => {
    if (!enabled || !token) return;
    try {
      const response = await api.get<{ success: boolean; data: RealtimeNotificationItem[]; meta?: { unreadCount?: number } }>('/notifications', {
        params: { status: 'unread', limit: 8 },
      });
      if (!response.data?.success || !Array.isArray(response.data.data)) return;
      const next = sortNewestFirst(response.data.data);
      next.forEach((item) => seenIds.current.add(item.id));
      setNotifications(next);
      setUnreadCount(response.data.meta?.unreadCount ?? next.length);
    } catch {
      // The persisted notification center remains available when the header refresh is unavailable.
    }
  }, [enabled, token]);

  useEffect(() => {
    if (!enabled || !token) return;

    let cancelled = false;
    let reconnectTimer: number | null = null;
    const controller = new AbortController();

    const connect = async () => {
      try {
        const response = await fetch(`${API_BASE_URL}/notifications/stream`, {
          headers: { Authorization: `Bearer ${token}` },
          signal: controller.signal,
        });
        if (!response.ok || !response.body) throw new Error('Notification stream unavailable');

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';

        while (!cancelled) {
          const result = await reader.read();
          if (result.done) break;
          buffer += decoder.decode(result.value, { stream: true });
          const blocks = buffer.split('\n\n');
          buffer = blocks.pop() || '';

          for (const block of blocks) {
            const parsed = parseEventBlock(block);
            if (parsed.event !== 'notification' || !parsed.data) continue;
            try {
              const item = JSON.parse(parsed.data) as RealtimeNotificationItem;
              const isNew = !seenIds.current.has(item.id);
              seenIds.current.add(item.id);
              setNotifications((current) => sortNewestFirst([item, ...current.filter((existing) => existing.id !== item.id)]).slice(0, 8));
              if (isNew && !item.isRead) setUnreadCount((current) => current + 1);
            } catch {
              // Ignore malformed individual events and keep the stream alive.
            }
          }
        }
      } catch {
        if (!cancelled) reconnectTimer = window.setTimeout(connect, 5000);
      }
    };

    const initialRefreshTimer = window.setTimeout(() => { void refresh(); }, 0);
    void connect();
    const fallbackInterval = window.setInterval(() => { void refresh(); }, 15000);
    const handleFocus = () => { void refresh(); };
    window.addEventListener('focus', handleFocus);

    return () => {
      cancelled = true;
      controller.abort();
      window.clearTimeout(initialRefreshTimer);
      if (reconnectTimer !== null) window.clearTimeout(reconnectTimer);
      window.clearInterval(fallbackInterval);
      window.removeEventListener('focus', handleFocus);
    };
  }, [enabled, refresh, token]);

  const markAsRead = useCallback(async (id: string) => {
    await api.put(`/notifications/${id}/read`);
    setNotifications((current) => current.map((item) => (item.id === id ? { ...item, isRead: true } : item)));
    setUnreadCount((current) => Math.max(0, current - 1));
  }, []);

  const markAllAsRead = useCallback(async () => {
    await api.put('/notifications/read-all');
    setNotifications((current) => current.map((item) => ({ ...item, isRead: true })));
    setUnreadCount(0);
  }, []);

  return { notifications, unreadCount, refresh, markAsRead, markAllAsRead };
};
