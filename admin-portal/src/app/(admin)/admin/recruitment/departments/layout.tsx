import type { ReactNode } from 'react';
import { getRecruitmentMetadata } from '@/lib/recruitmentMetadata';

export const metadata = getRecruitmentMetadata('departments');

export default function DepartmentsLayout({ children }: { children: ReactNode }) {
  return children;
}
