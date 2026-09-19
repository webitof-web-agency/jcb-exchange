import type { ReactNode } from 'react';
import { getRecruitmentMetadata } from '@/lib/recruitmentMetadata';

export const metadata = getRecruitmentMetadata('settings');

export default function SettingsLayout({ children }: { children: ReactNode }) {
  return children;
}
