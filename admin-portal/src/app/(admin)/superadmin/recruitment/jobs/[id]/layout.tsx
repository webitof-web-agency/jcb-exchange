import type { ReactNode } from 'react';
import { getRecruitmentMetadata } from '@/lib/recruitmentMetadata';

export const metadata = getRecruitmentMetadata('jobDetail');

export default function JobDetailLayout({ children }: { children: ReactNode }) {
  return children;
}
