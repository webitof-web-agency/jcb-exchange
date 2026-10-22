import type { ReactNode } from 'react';
import { getRecruitmentMetadata } from '@/lib/recruitmentMetadata';

export const metadata = getRecruitmentMetadata('candidates');

export default function CandidatesLayout({ children }: { children: ReactNode }) {
  return children;
}
