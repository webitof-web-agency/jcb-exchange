import type { ReactNode } from 'react';
import { getRecruitmentMetadata } from '@/lib/recruitmentMetadata';

export const metadata = getRecruitmentMetadata('offers');

export default function OffersLayout({ children }: { children: ReactNode }) {
  return children;
}
