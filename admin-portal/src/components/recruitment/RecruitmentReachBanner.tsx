'use client';

import { MapPin } from 'lucide-react';
import { describeRecruitmentReach } from '@/lib/recruitmentReach';
import useRecruitmentReach from './useRecruitmentReach';

/** Says which states the recruitment pages are showing (nothing for an all-India viewer). */
export default function RecruitmentReachBanner() {
  const banner = describeRecruitmentReach(useRecruitmentReach());
  if (!banner) return null;
  return (
    <div role="status" className={`mx-auto mb-3 flex w-full max-w-7xl items-start gap-2 rounded-xl border px-3 py-2.5 text-xs font-semibold ${banner.tone === 'warning' ? 'border-amber-200 bg-amber-50 text-amber-900' : 'border-sky-200 bg-sky-50 text-sky-900'}`}>
      <MapPin className="mt-px h-3.5 w-3.5 shrink-0" aria-hidden="true" />
      <span>{banner.text}</span>
    </div>
  );
}
