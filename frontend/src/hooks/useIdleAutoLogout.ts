'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

type UseIdleAutoLogoutOptions = {
  timeoutMs: number;
  warningMs: number;
  onLogout: () => void;
  enabled?: boolean;
  storageKey?: string;
};

export function useIdleAutoLogout({
  timeoutMs,
  warningMs,
  onLogout,
  enabled = true,
  storageKey = 'frontend_portal_token',
}: UseIdleAutoLogoutOptions) {
  const logoutTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const warningTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastActivityAtRef = useRef(0);
  const onLogoutRef = useRef(onLogout);
  const [isWarningVisible, setIsWarningVisible] = useState(false);

  useEffect(() => {
    onLogoutRef.current = onLogout;
  }, [onLogout]);

  const clearTimers = useCallback(() => {
    if (logoutTimerRef.current) clearTimeout(logoutTimerRef.current);
    if (warningTimerRef.current) clearTimeout(warningTimerRef.current);
    logoutTimerRef.current = null;
    warningTimerRef.current = null;
  }, []);

  const logoutNow = useCallback(() => {
    clearTimers();
    setIsWarningVisible(false);
    onLogoutRef.current();
  }, [clearTimers]);

  const scheduleFromLastActivity = useCallback((resetActivity: boolean) => {
    clearTimers();

    if (resetActivity) {
      lastActivityAtRef.current = Date.now();
    }

    if (!enabled) {
      return;
    }

    const elapsedMs = Date.now() - lastActivityAtRef.current;
    const remainingMs = timeoutMs - elapsedMs;
    if (remainingMs <= 0) {
      logoutNow();
      return;
    }

    setIsWarningVisible(false);
    const warningDelayMs = Math.max(0, remainingMs - warningMs);
    warningTimerRef.current = setTimeout(() => {
      setIsWarningVisible(true);
    }, warningDelayMs);
    logoutTimerRef.current = setTimeout(logoutNow, remainingMs);
  }, [clearTimers, enabled, logoutNow, timeoutMs, warningMs]);

  const recordActivity = useCallback(() => {
    scheduleFromLastActivity(true);
  }, [scheduleFromLastActivity]);

  useEffect(() => {
    if (!enabled) {
      clearTimers();
      return;
    }

    const activityEvents = ['mousemove', 'mousedown', 'keydown', 'touchstart', 'scroll', 'click'];
    const handleActivity = () => recordActivity();
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        scheduleFromLastActivity(false);
      }
    };
    const handleStorage = (event: StorageEvent) => {
      if (event.key === storageKey && event.newValue === null) {
        logoutNow();
      }
    };

    activityEvents.forEach((eventName) => {
      window.addEventListener(eventName, handleActivity, { passive: true });
    });
    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('storage', handleStorage);
    scheduleFromLastActivity(true);

    return () => {
      clearTimers();
      activityEvents.forEach((eventName) => {
        window.removeEventListener(eventName, handleActivity);
      });
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('storage', handleStorage);
    };
  }, [clearTimers, enabled, logoutNow, recordActivity, scheduleFromLastActivity, storageKey]);

  return {
    isWarningVisible,
    stayLoggedIn: recordActivity,
  };
}
