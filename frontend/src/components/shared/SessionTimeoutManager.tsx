'use client';

import { useMemo } from 'react';
import { useAuthStore } from '@/store/authStore';
import { getIdleTimeoutMs, getWarningTimeoutMs } from '@/lib/sessionTimeout.mjs';
import { useIdleAutoLogout } from '@/hooks/useIdleAutoLogout';

export default function SessionTimeoutManager() {
  const { isAuthenticated, logout, setAuthModalOpen } = useAuthStore();
  const timeoutMs = useMemo(
    () => getIdleTimeoutMs(process.env.NEXT_PUBLIC_IDLE_TIMEOUT_MINUTES),
    [],
  );
  const warningMs = useMemo(() => getWarningTimeoutMs(timeoutMs), [timeoutMs]);
  const { isWarningVisible, stayLoggedIn } = useIdleAutoLogout({
    timeoutMs,
    warningMs,
    enabled: isAuthenticated,
    onLogout: () => {
      logout();
      setAuthModalOpen(true);
    },
  });

  if (!isAuthenticated || !isWarningVisible) return null;

  return (
    <div className="fixed inset-0 z-[99999] flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="session-timeout-title"
        className="w-full max-w-md rounded-2xl border border-amber-200 bg-white p-7 text-center shadow-2xl"
      >
        <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-amber-100 text-2xl" aria-hidden="true">
          ⏱
        </div>
        <h2 id="session-timeout-title" className="text-lg font-bold text-gray-900">
          Session expiring soon
        </h2>
        <p className="mt-2 text-sm leading-6 text-gray-600">
          You have been inactive. Stay signed in to continue using JCB Exchange.
        </p>
        <button
          type="button"
          onClick={stayLoggedIn}
          className="mt-6 w-full rounded-xl bg-[#FFC107] px-4 py-3 text-sm font-bold text-gray-900 transition hover:bg-[#FFB300]"
        >
          Stay logged in
        </button>
      </div>
    </div>
  );
}
