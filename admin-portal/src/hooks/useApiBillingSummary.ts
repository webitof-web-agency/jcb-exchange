'use client';

import { useEffect, useState } from 'react';
import { fetchApiBillingSummary } from '@/lib/apiBillingClient';
import { API_BILLING_SUMMARY_CHANGED_EVENT, type ApiBillingSummary } from '@/lib/apiBilling';
import { useAuthStore } from '@/store/authStore';
import {
  API_BILLING_POLL_INTERVAL_MS,
  shouldFetchApiBillingSummary,
  shouldPollApiBillingSummary,
  type ApiBillingSummaryStatus,
} from './apiBillingSummaryState';

// `enabled` = false for staff without any paid-verification permission: the API would only answer 403.
export const useApiBillingSummary = (enabled = true) => {
  const [summary, setSummary] = useState<ApiBillingSummary | null>(null);
  const [status, setStatus] = useState<ApiBillingSummaryStatus>('loading');
  const hasHydrated = useAuthStore((state) => state.hasHydrated);
  const token = useAuthStore((state) => state.token);

  useEffect(() => {
    let active = true;
    let inFlight = false;

    const loadSummary = async () => {
      // The API client reads the token from the auth store. Waiting for hydration
      // avoids a one-time unauthenticated request on a hard page refresh.
      if (!enabled || !shouldFetchApiBillingSummary(hasHydrated, token)) {
        if (active) {
          setSummary(null);
          setStatus(hasHydrated ? 'unavailable' : 'loading');
        }
        return;
      }

      if (inFlight) return;
      inFlight = true;

      try {
        const next = await fetchApiBillingSummary();
        if (active) {
          setSummary(next);
          setStatus('ready');
        }
      } catch {
        // Keep the last confirmed balance visible during a transient outage.
        // Verification tools remain usable while the billing endpoint is down.
        if (active) {
          setStatus('unavailable');
        }
      } finally {
        inFlight = false;
      }
    };

    void loadSummary();

    const refreshOnBillingChange = () => {
      void loadSummary();
    };
    window.addEventListener(API_BILLING_SUMMARY_CHANGED_EVENT, refreshOnBillingChange);

    const refreshIfVisible = () => {
      if (shouldPollApiBillingSummary(hasHydrated, token, document.visibilityState === 'visible')) {
        void loadSummary();
      }
    };

    const pollId = window.setInterval(refreshIfVisible, API_BILLING_POLL_INTERVAL_MS);
    document.addEventListener('visibilitychange', refreshIfVisible);

    return () => {
      active = false;
      window.clearInterval(pollId);
      document.removeEventListener('visibilitychange', refreshIfVisible);
      window.removeEventListener(API_BILLING_SUMMARY_CHANGED_EVENT, refreshOnBillingChange);
    };
  }, [enabled, hasHydrated, token]);

  return { summary, status };
};
