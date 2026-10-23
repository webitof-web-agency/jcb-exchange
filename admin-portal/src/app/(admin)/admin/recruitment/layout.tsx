import type { ReactNode } from 'react';
import { recruitmentRootMetadata } from '@/lib/recruitmentMetadata';

export const metadata = recruitmentRootMetadata;

export default function RecruitmentLayout({ children }: { children: ReactNode }) {
  return children;
}
