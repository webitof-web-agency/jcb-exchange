'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { getIdleSessionState } from '@/lib/idleSession.mjs';

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
  const checkTimerRef = useRef<number | null>(null);
  const lastActivityAtRef = useRef(0);
  const onLogoutRef = useRef(onLogout);
  const [isWarningVisible, setIsWarningVisible] = useState(false);

  useEffect(() => {
    onLogoutRef.current = onLogout;
  }, [onLogout]);

  const clearTimer = useCallback(() => {
    if (checkTimerRef.current !== null) window.clearInterval(checkTimerRef.current);
    checkTimerRef.current = null;
  }, []);

  const recordActivity = useCallback(() => {
    lastActivityAtRef.current = Date.now();
    setIsWarningVisible(false);
  }, []);

  const hideWarning = useCallback(() => {
    setIsWarningVisible(false);
  }, []);

  const checkIdleState = useCallback(() => {
    const state = getIdleSessionState(lastActivityAtRef.current, Date.now(), timeoutMs, warningMs);

    if (state.shouldLogout) {
      clearTimer();
      setIsWarningVisible(false);
      onLogoutRef.current();
      return;
    }

    setIsWarningVisible(state.shouldWarn);
  }, [clearTimer, timeoutMs, warningMs]);

  useEffect(() => {
    if (!enabled) {
      clearTimer();
      window.setTimeout(hideWarning, 0);
      return;
    }

    const activityEvents = ['mousemove', 'mousedown', 'keydown', 'touchstart', 'scroll', 'click'];
    const handleActivity = () => recordActivity();
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        checkIdleState();
      }
    };
    const handleWindowFocus = () => checkIdleState();
    const handleStorage = (event: StorageEvent) => {
      if (event.key === storageKey && event.newValue === null) {
        clearTimer();
        setIsWarningVisible(false);
        onLogoutRef.current();
      }
    };

    activityEvents.forEach((eventName) => {
      window.addEventListener(eventName, handleActivity, { passive: true });
    });
    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('focus', handleWindowFocus);
    window.addEventListener('storage', handleStorage);
    lastActivityAtRef.current = Date.now();
    checkIdleState();
    checkTimerRef.current = window.setInterval(checkIdleState, 1000);

    return () => {
      clearTimer();
      activityEvents.forEach((eventName) => {
        window.removeEventListener(eventName, handleActivity);
      });
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('focus', handleWindowFocus);
      window.removeEventListener('storage', handleStorage);
    };
  }, [checkIdleState, clearTimer, enabled, hideWarning, recordActivity, storageKey]);

  return {
    isWarningVisible,
    stayLoggedIn: recordActivity,
  };
}
