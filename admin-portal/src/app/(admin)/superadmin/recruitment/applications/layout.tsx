import type { ReactNode } from 'react';
import { getRecruitmentMetadata } from '@/lib/recruitmentMetadata';

export const metadata = getRecruitmentMetadata('applications');

export default function ApplicationsLayout({ children }: { children: ReactNode }) {
  return children;
}
