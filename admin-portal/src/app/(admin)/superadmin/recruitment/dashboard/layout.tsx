import type { ReactNode } from 'react';
import { getRecruitmentMetadata } from '@/lib/recruitmentMetadata';

export const metadata = getRecruitmentMetadata('dashboard');

export default function DashboardLayout({ children }: { children: ReactNode }) {
  return children;
}
