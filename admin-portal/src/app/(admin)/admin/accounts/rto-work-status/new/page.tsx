'use client';

import { Suspense } from 'react';
import BrandLoader from '@/components/ui/BrandLoader';
import RtoWorkspace from '@/components/accounts/rto/RtoWorkspace';

export default function NewRtoRecordPage() {
  return (
    <Suspense fallback={<BrandLoader variant="section" size="sm" bg="light" text="Loading..." />}>
      <RtoWorkspace />
    </Suspense>
  );
}
