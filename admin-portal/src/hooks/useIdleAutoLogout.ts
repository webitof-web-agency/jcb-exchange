import { useEffect, useRef, useCallback } from 'react';
import { getIdleSessionState } from '@/lib/idleSession.mjs';

/**
 * useIdleAutoLogout
 * Tracks user activity (mouse, keyboard, touch, scroll) and calls onLogout
 * if the user is idle for more than `timeoutMs` milliseconds.
 * Shows a warning dialog `warningMs` before logout so the user can stay.
 */
export function useIdleAutoLogout({
  timeoutMs,
  warningMs = 60_000,
  onLogout,
  enabled = true,
  storageKey = 'portal_token',
}: {
  timeoutMs: number;
  warningMs?: number;
  onLogout: () => void;
  enabled?: boolean;
  storageKey?: string;
}) {
  const checkTimer = useRef<number | null>(null);
  const warningInterval = useRef<number | null>(null);
  const lastActivityAtRef = useRef(0);
  const warningShownRef = useRef(false);
  const resetTimersRef = useRef<() => void>(() => undefined);
  const onLogoutRef = useRef(onLogout);

  useEffect(() => {
    onLogoutRef.current = onLogout;
  }, [onLogout]);

  const clearTimers = useCallback(() => {
    if (checkTimer.current !== null) window.clearInterval(checkTimer.current);
    checkTimer.current = null;
  }, []);

  const dismissWarning = useCallback(() => {
    if (warningInterval.current !== null) window.clearInterval(warningInterval.current);
    warningInterval.current = null;
    const overlay = document.getElementById('idle-logout-warning-overlay');
    if (overlay) overlay.remove();
    warningShownRef.current = false;
  }, []);

  const showWarning = useCallback((remainingMs: number) => {
    if (warningShownRef.current) return;
    warningShownRef.current = true;

    if (warningInterval.current !== null) window.clearInterval(warningInterval.current);
    warningInterval.current = null;

    // Remove any existing overlay first
    const existing = document.getElementById('idle-logout-warning-overlay');
    if (existing) existing.remove();

    const remainingSecs = Math.round(remainingMs / 1000);

    const overlay = document.createElement('div');
    overlay.id = 'idle-logout-warning-overlay';
    overlay.style.cssText = `
      position: fixed; inset: 0; z-index: 99999;
      background: rgba(0,0,0,0.55); backdrop-filter: blur(4px);
      display: flex; align-items: center; justify-content: center;
      font-family: Inter, system-ui, sans-serif;
    `;

    overlay.innerHTML = `
      <div style="
        background: #fff; border-radius: 20px; padding: 32px 28px;
        max-width: 420px; width: 90%; box-shadow: 0 25px 60px rgba(0,0,0,0.25);
        border: 1.5px solid #FEE2A0; text-align: center;
      ">
        <div style="
          width: 56px; height: 56px; border-radius: 50%;
          background: #FEF3C7; margin: 0 auto 16px;
          display: flex; align-items: center; justify-content: center;
          font-size: 26px;
        ">⏱️</div>
        <h2 style="margin:0 0 8px; font-size:18px; font-weight:700; color:#111827;">
          Session Expiring Soon
        </h2>
        <p style="margin:0 0 6px; font-size:14px; color:#6B7280; line-height:1.5;">
          You have been idle. You will be logged out in
        </p>
        <p id="idle-countdown" style="margin:0 0 24px; font-size:28px; font-weight:800; color:#D97706;">
          ${remainingSecs}s
        </p>
        <button id="idle-stay-btn" style="
          background: #FFC107; color: #111827; border: none; cursor: pointer;
          padding: 10px 32px; border-radius: 12px; font-size:14px;
          font-weight:700; width:100%; transition: background 0.2s;
        ">
          Stay Logged In
        </button>
      </div>
    `;

    document.body.appendChild(overlay);

    // Countdown updater
    let remaining = remainingSecs;
    const interval = window.setInterval(() => {
      remaining -= 1;
      const el = document.getElementById('idle-countdown');
      if (el) el.textContent = `${remaining}s`;
      if (remaining <= 0) {
        window.clearInterval(interval);
        warningInterval.current = null;
      }
    }, 1000);
    warningInterval.current = interval;

    // Stay button
    const stayBtn = document.getElementById('idle-stay-btn');
    if (stayBtn) {
      stayBtn.addEventListener('click', () => {
      window.clearInterval(interval);
      warningInterval.current = null;
      dismissWarning();
        // Reset timers as if user just acted
        resetTimersRef.current();
      });
    }

    // Auto-remove overlay when logout fires (handled by onLogout clearing DOM)
  }, [dismissWarning]);

  const resetIdleSession = useCallback(() => {
    lastActivityAtRef.current = Date.now();
    dismissWarning();
  }, [dismissWarning]);

  const checkIdleState = useCallback(() => {
    const state = getIdleSessionState(lastActivityAtRef.current, Date.now(), timeoutMs, warningMs);

    if (state.shouldLogout) {
      clearTimers();
      dismissWarning();
      warningShownRef.current = false;
      onLogoutRef.current();
      return;
    }

    if (state.shouldWarn) {
      showWarning(state.remainingMs);
    } else {
      dismissWarning();
    }
  }, [clearTimers, dismissWarning, showWarning, timeoutMs, warningMs]);

  useEffect(() => {
    if (!enabled) {
      clearTimers();
      dismissWarning();
      return;
    }

    const events = ['mousemove', 'mousedown', 'keydown', 'touchstart', 'scroll', 'click'];

    const handleActivity = () => resetIdleSession();
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') checkIdleState();
    };
    const handleWindowFocus = () => checkIdleState();
    const handleStorage = (event: StorageEvent) => {
      if (event.key === storageKey && event.newValue === null) {
        clearTimers();
        dismissWarning();
        onLogoutRef.current();
      }
    };

    events.forEach((event) => window.addEventListener(event, handleActivity, { passive: true }));
    window.addEventListener('storage', handleStorage);
    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('focus', handleWindowFocus);
    resetTimersRef.current = resetIdleSession;

    lastActivityAtRef.current = Date.now();
    checkIdleState();
    checkTimer.current = window.setInterval(checkIdleState, 1000);

    return () => {
      clearTimers();
      events.forEach((event) => window.removeEventListener(event, handleActivity));
      window.removeEventListener('storage', handleStorage);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('focus', handleWindowFocus);
      resetTimersRef.current = () => undefined;
      dismissWarning();
    };
  }, [checkIdleState, clearTimers, dismissWarning, enabled, resetIdleSession, storageKey]);
}
