'use client';

import { useEffect, useState } from 'react';
import api from '@/lib/api';
import type { RecruitmentReachInfo } from '@/lib/recruitmentReach';
import { useAuthStore } from '@/store/authStore';

/** Short-lived: several parts of one page ask for it, and access changed elsewhere shows on the next visit. */
const TTL_MS = 30_000;
let cache: { userId: string; at: number; request: Promise<RecruitmentReachInfo | null> } | null = null;

const load = (userId: string) => {
  if (cache && cache.userId === userId && Date.now() - cache.at < TTL_MS) return cache.request;
  const request = api.get<{ success: boolean; reach: RecruitmentReachInfo }>('/recruitment/admin/reach')
    .then((response) => response.data.reach)
    .catch(() => {
      // The server still limits everything; without an answer the screens simply do not narrow their choices.
      cache = null;
      return null;
    });
  cache = { userId, at: Date.now(), request };
  return request;
};

/** The signed-in person's recruitment places; null while loading (or when it could not be read). */
export default function useRecruitmentReach() {
  const userId = useAuthStore((state) => state.user?.id ?? '');
  const [loaded, setLoaded] = useState<{ userId: string; reach: RecruitmentReachInfo | null }>({ userId: '', reach: null });

  useEffect(() => {
    if (!userId) return undefined;
    let cancelled = false;
    void load(userId).then((reach) => { if (!cancelled) setLoaded({ userId, reach }); });
    return () => { cancelled = true; };
  }, [userId]);

  return loaded.userId === userId ? loaded.reach : null;
}
