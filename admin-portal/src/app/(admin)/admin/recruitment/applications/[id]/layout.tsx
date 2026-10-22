import type { ReactNode } from 'react';
import { getRecruitmentMetadata } from '@/lib/recruitmentMetadata';

export const metadata = getRecruitmentMetadata('applicationDetail');

export default function ApplicationDetailLayout({ children }: { children: ReactNode }) {
  return children;
}
