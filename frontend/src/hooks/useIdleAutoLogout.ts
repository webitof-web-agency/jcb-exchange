'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  getActivityStorageKey,
  getIdleSessionState,
  getStoredActivityAt,
  shouldAcceptActivityAt,
} from '@/lib/idleSession.mjs';

const ACTIVITY_PERSIST_INTERVAL_MS = 1_000;

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
  const lastPersistedActivityAtRef = useRef(0);
  const onLogoutRef = useRef(onLogout);
  const [isWarningVisible, setIsWarningVisible] = useState(false);
  const activityStorageKey = getActivityStorageKey(storageKey);

  useEffect(() => {
    onLogoutRef.current = onLogout;
  }, [onLogout]);

  const clearTimer = useCallback(() => {
    if (checkTimerRef.current !== null) window.clearInterval(checkTimerRef.current);
    checkTimerRef.current = null;
  }, []);

  const recordActivity = useCallback(() => {
    const now = Date.now();
    lastActivityAtRef.current = now;
    setIsWarningVisible(false);

    if (now - lastPersistedActivityAtRef.current < ACTIVITY_PERSIST_INTERVAL_MS) return;

    try {
      localStorage.setItem(activityStorageKey, String(now));
      lastPersistedActivityAtRef.current = now;
    } catch {
      // Storage can be unavailable in privacy-restricted browser contexts.
    }
  }, [activityStorageKey]);

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

    const activityEvents = [
      'mousemove', 'pointermove', 'mousedown', 'pointerdown', 'keydown', 'input',
      'touchstart', 'wheel', 'scroll', 'click',
    ];
    const handleActivity = () => recordActivity();
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        const state = getIdleSessionState(lastActivityAtRef.current, Date.now(), timeoutMs, warningMs);
        if (state.shouldLogout) checkIdleState();
        else recordActivity();
      }
    };
    const handleWindowFocus = () => {
      const state = getIdleSessionState(lastActivityAtRef.current, Date.now(), timeoutMs, warningMs);
      if (state.shouldLogout) checkIdleState();
      else recordActivity();
    };
    const handleStorage = (event: StorageEvent) => {
      if (event.key === storageKey && event.newValue === null) {
        clearTimer();
        setIsWarningVisible(false);
        onLogoutRef.current();
        return;
      }

      if (event.key === activityStorageKey) {
        const incomingActivityAt = getStoredActivityAt(event.newValue, 0);
        if (shouldAcceptActivityAt(lastActivityAtRef.current, incomingActivityAt)) {
          lastActivityAtRef.current = incomingActivityAt;
          lastPersistedActivityAtRef.current = incomingActivityAt;
          setIsWarningVisible(false);
        }
      }
    };

    activityEvents.forEach((eventName) => {
      window.addEventListener(eventName, handleActivity, { passive: true });
    });
    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('focus', handleWindowFocus);
    window.addEventListener('storage', handleStorage);
    const now = Date.now();
    let sharedActivityAt = 0;
    try {
      sharedActivityAt = getStoredActivityAt(localStorage.getItem(activityStorageKey), 0);
    } catch {
      sharedActivityAt = 0;
    }
    lastActivityAtRef.current = sharedActivityAt || now;
    lastPersistedActivityAtRef.current = sharedActivityAt || 0;
    if (!sharedActivityAt) {
      try {
        localStorage.setItem(activityStorageKey, String(now));
        lastPersistedActivityAtRef.current = now;
      } catch {
        // Storage can be unavailable in privacy-restricted browser contexts.
      }
    }
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
  }, [activityStorageKey, checkIdleState, clearTimer, enabled, hideWarning, recordActivity, storageKey, timeoutMs, warningMs]);

  return {
    isWarningVisible,
    stayLoggedIn: recordActivity,
  };
}
