'use client';

import { useCallback, useEffect, useState } from 'react';
import { useAuthStore } from '@/store/authStore';

// Pinned and recently opened finance pages, per user, in this browser only. Storage can be
// unavailable (private mode, blocked site data), so every access is guarded and failures are
// treated as "nothing saved".

export type FinancePageRef = { href: string; label: string; group?: string };

const EVENT = 'finance-prefs-changed';
const RECENT_LIMIT = 8;
const PIN_LIMIT = 12;
const storageKey = (kind: 'pins' | 'recent', userId: string) => `finance:${kind}:${userId}`;

const read = (kind: 'pins' | 'recent', userId: string): FinancePageRef[] => {
  try {
    const parsed = JSON.parse(window.localStorage.getItem(storageKey(kind, userId)) || '[]');
    return Array.isArray(parsed) ? parsed.filter((item) => item && typeof item.href === 'string' && typeof item.label === 'string') : [];
  } catch {
    return [];
  }
};

const write = (kind: 'pins' | 'recent', userId: string, items: FinancePageRef[]) => {
  try {
    window.localStorage.setItem(storageKey(kind, userId), JSON.stringify(items));
  } catch {
    // Not saved; the page still works.
  }
  window.dispatchEvent(new Event(EVENT));
};

/** Pinned + recent finance pages for the signed-in user, live across components. */
export function useFinancePrefs() {
  const userId = useAuthStore((state) => state.user?.id) || 'anonymous';
  const [state, setState] = useState<{ pins: FinancePageRef[]; recent: FinancePageRef[] }>({ pins: [], recent: [] });

  useEffect(() => {
    const sync = () => setState({ pins: read('pins', userId), recent: read('recent', userId) });
    sync();
    window.addEventListener(EVENT, sync);
    window.addEventListener('storage', sync);
    return () => {
      window.removeEventListener(EVENT, sync);
      window.removeEventListener('storage', sync);
    };
  }, [userId]);

  const isPinned = useCallback((href: string) => state.pins.some((item) => item.href === href), [state.pins]);
  const togglePin = useCallback((page: FinancePageRef) => {
    const pins = read('pins', userId);
    const next = pins.some((item) => item.href === page.href) ? pins.filter((item) => item.href !== page.href) : [page, ...pins].slice(0, PIN_LIMIT);
    write('pins', userId, next);
  }, [userId]);
  const recordVisit = useCallback((page: FinancePageRef) => {
    const recent = read('recent', userId);
    if (recent[0]?.href === page.href) return;
    write('recent', userId, [page, ...recent.filter((item) => item.href !== page.href)].slice(0, RECENT_LIMIT));
  }, [userId]);

  return { ...state, isPinned, togglePin, recordVisit };
}

