'use client';

import { useEffect, useState } from 'react';
import { fetchApiBillingSummary } from '@/lib/apiBillingClient';
import type { ApiBillingSummary } from '@/lib/apiBilling';
import { useAuthStore } from '@/store/authStore';
import {
  API_BILLING_POLL_INTERVAL_MS,
  shouldFetchApiBillingSummary,
  shouldPollApiBillingSummary,
  type ApiBillingSummaryStatus,
} from './apiBillingSummaryState';

export const useApiBillingSummary = () => {
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
      if (!shouldFetchApiBillingSummary(hasHydrated, token)) {
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
    };
  }, [hasHydrated, token]);

  return { summary, status };
};
