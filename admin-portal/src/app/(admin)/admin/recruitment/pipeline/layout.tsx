import type { ReactNode } from 'react';
import { getRecruitmentMetadata } from '@/lib/recruitmentMetadata';

export const metadata = getRecruitmentMetadata('pipeline');

export default function PipelineLayout({ children }: { children: ReactNode }) {
  return children;
}
