import type { ReactNode } from 'react';
import { getRecruitmentMetadata } from '@/lib/recruitmentMetadata';

export const metadata = getRecruitmentMetadata('jobs');

export default function JobsLayout({ children }: { children: ReactNode }) {
  return children;
}
