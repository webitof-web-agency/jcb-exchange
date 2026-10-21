"use client";

import api from '@/lib/api';
import { createSingleFlight } from '@/lib/authHandoff.mjs';
import { useRouter } from 'next/navigation';
import { useEffect, useRef } from 'react';
import { useAuthStore } from '@/store/authStore';

const getSafeNextRoute = (value: string | null) =>
  value && value.startsWith('/') && !value.startsWith('//') ? value : '/';

const clearHandoffParams = (nextRoute: string) => {
  window.history.replaceState(null, '', nextRoute);
};

export default function LoginPage() {
  const router = useRouter();
  const handoffRunnerRef = useRef<(() => Promise<void>) | null>(null);
  const { isAuthenticated, setAuth, setAuthModalOpen } = useAuthStore();

  useEffect(() => {
    const searchParams = new URLSearchParams(window.location.search);
    const handoffToken = searchParams.get('token');

    if (!handoffToken) {
      return;
    }

    const nextRoute = getSafeNextRoute(searchParams.get('next'));

    const consumeHandoff = async () => {
      try {
        const response = await api.get('/auth/profile', {
          headers: { Authorization: `Bearer ${handoffToken}` },
        });

        clearHandoffParams(nextRoute);
        setAuth(handoffToken, response.data.user);
        router.replace(nextRoute);
      } catch {
        clearHandoffParams('/login');
        setAuthModalOpen(true, 'login');
      }
    };

    if (!handoffRunnerRef.current) {
      handoffRunnerRef.current = createSingleFlight(consumeHandoff);
    }

    void handoffRunnerRef.current();
  }, [router, setAuth, setAuthModalOpen]);

  useEffect(() => {
    if (new URLSearchParams(window.location.search).has('token')) {
      return;
    }

    if (isAuthenticated) {
      router.replace('/');
    } else {
      setAuthModalOpen(true, 'login');
    }
  }, [isAuthenticated, router, setAuthModalOpen]);

  return (
    <div className="flex min-h-screen w-full items-center justify-center bg-gray-50 p-4">
      <div className="text-center">
        <p className="text-sm font-semibold text-gray-500">Opening login page...</p>
      </div>
    </div>
  );
}
