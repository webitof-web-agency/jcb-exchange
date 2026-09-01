'use client';

import { useEffect, useState } from 'react';
import { Bell, X } from 'lucide-react';
import api from '@/lib/api';
import { useAuthStore } from '@/store/authStore';

type PushConfigResponse = {
  success: boolean;
  data?: {
    isEnabled: boolean;
    publicKey: string | null;
  };
};

export default function PushNotificationManager() {
  const { hasHydrated, hydrateAuth, isAuthenticated } = useAuthStore();
  const [subscription, setSubscription] = useState<PushSubscription | null>(null);
  const [showPrompt, setShowPrompt] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [publicKey, setPublicKey] = useState<string | null>(null);
  const isSupported =
    typeof window !== 'undefined' &&
    'serviceWorker' in navigator &&
    'PushManager' in window;

  useEffect(() => {
    if (!hasHydrated) {
      hydrateAuth();
    }
  }, [hasHydrated, hydrateAuth]);

  useEffect(() => {
    if (!hasHydrated || !isAuthenticated) {
      return;
    }

    let promptTimer: number | null = null;
    let isCancelled = false;

    async function getPushPublicKey() {
      const response = await api.get<PushConfigResponse>('/notifications/push-config');
      const config = response.data?.data;

      if (!config?.isEnabled || !config.publicKey) {
        return null;
      }

      return config.publicKey;
    }

    async function syncSubscription(currentSubscription: PushSubscription) {
      await api.post('/notifications/push-subscription', currentSubscription.toJSON());
    }

    async function checkSubscription() {
      try {
        const key = await getPushPublicKey();
        if (isCancelled || !key) {
          return;
        }

        setPublicKey(key);
        const registration = await navigator.serviceWorker.register('/service-worker.js', {
          scope: '/',
          updateViaCache: 'none',
        });
        const sub = await registration.pushManager.getSubscription();
        if (isCancelled) {
          return;
        }

        setSubscription(sub);

        if (sub) {
          await syncSubscription(sub);
          return;
        }

        if (Notification.permission !== 'denied') {
          promptTimer = window.setTimeout(() => setShowPrompt(true), 3000);
        }
      } catch (error) {
        console.error('Service Worker registration failed:', error);
      }
    }

    if (isSupported) {
      void checkSubscription();
    }
    return () => {
      isCancelled = true;
      if (promptTimer !== null) {
        window.clearTimeout(promptTimer);
      }
    };
  }, [hasHydrated, isAuthenticated, isSupported]);

  async function subscribeToPush() {
    if (!publicKey) {
      return;
    }

    setIsLoading(true);
    try {
      const registration = await navigator.serviceWorker.ready;
      const applicationServerKey = urlB64ToUint8Array(publicKey);
      const sub = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey,
      });

      try {
        await api.post('/notifications/push-subscription', sub.toJSON());
      } catch (error) {
        await sub.unsubscribe().catch(() => undefined);
        throw error;
      }

      setSubscription(sub);
      setShowPrompt(false);
    } catch (error) {
      console.error('Failed to subscribe: ', error);
    } finally {
      setIsLoading(false);
    }
  }

  // Utility function for VAPID key encoding
  function urlB64ToUint8Array(base64String: string) {
    const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
    const base64 = (base64String + padding).replace(/\-/g, '+').replace(/_/g, '/');
    const rawData = window.atob(base64);
    const outputArray = new Uint8Array(rawData.length);
    for (let i = 0; i < rawData.length; ++i) {
      outputArray[i] = rawData.charCodeAt(i);
    }
    return outputArray;
  }

  if (!hasHydrated || !isAuthenticated || !isSupported || !showPrompt || subscription) {
    return null;
  }

  return (
    <div className="fixed bottom-6 right-6 z-50 flex items-start space-x-4 bg-white/70 backdrop-blur-xl p-5 rounded-2xl shadow-[0_8px_30px_rgb(0,0,0,0.12)] border border-white/50 max-w-sm animate-in slide-in-from-bottom-5 duration-500 fade-in">
      <div className="bg-orange-100 p-2.5 rounded-full text-orange-600 shadow-inner flex-shrink-0">
        <Bell className="w-6 h-6 animate-pulse" />
      </div>
      <div className="flex-1 pr-2">
        <h3 className="text-gray-900 font-bold text-sm tracking-tight mb-1">Stay Updated!</h3>
        <p className="text-gray-600 text-xs leading-relaxed mb-3">
          Get instant alerts when a new JCB listing is added or when someone replies to your lead.
        </p>
        <div className="flex space-x-2">
          <button
            onClick={subscribeToPush}
            disabled={isLoading}
            className="flex-1 bg-orange-600 hover:bg-orange-700 text-white text-xs font-semibold py-2 px-3 rounded-xl transition-all shadow-md shadow-orange-600/20 active:scale-95 disabled:opacity-70 flex items-center justify-center"
          >
            {isLoading ? 'Enabling...' : 'Enable Alerts'}
          </button>
          <button
            onClick={() => setShowPrompt(false)}
            className="px-3 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 text-xs font-medium rounded-xl transition-all active:scale-95"
          >
            Maybe Later
          </button>
        </div>
      </div>
      <button 
        onClick={() => setShowPrompt(false)}
        className="absolute top-3 right-3 text-gray-400 hover:text-gray-600 p-1 bg-gray-50/50 hover:bg-gray-100 rounded-full transition-colors"
      >
        <X className="w-4 h-4" />
      </button>
    </div>
  );
}
