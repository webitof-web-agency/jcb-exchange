import type { ReactNode } from 'react';
import { recruitmentRootMetadata } from '@/lib/recruitmentMetadata';
import RecruitmentReachBanner from '@/components/recruitment/RecruitmentReachBanner';

export const metadata = recruitmentRootMetadata;

export default function RecruitmentLayout({ children }: { children: ReactNode }) {
  // The banner says which states are shown (a state-limited recruiter); nothing for all-India viewers.
  return (
    <>
      <RecruitmentReachBanner />
      {children}
    </>
  );
}
