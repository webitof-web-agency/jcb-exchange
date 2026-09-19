import type { ReactNode } from 'react';
import { getRecruitmentMetadata } from '@/lib/recruitmentMetadata';

export const metadata = getRecruitmentMetadata('interviews');

export default function InterviewsLayout({ children }: { children: ReactNode }) {
  return children;
}
