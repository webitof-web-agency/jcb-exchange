'use client';

import { Suspense } from 'react';
import { useParams } from 'next/navigation';
import BrandLoader from '@/components/ui/BrandLoader';
import RtoWorkspace from '@/components/accounts/rto/RtoWorkspace';

export default function RtoTransferWorkspacePage() {
  const params = useParams();
  const id = decodeURIComponent(String(params?.id || ''));
  return (
    <Suspense fallback={<BrandLoader variant="section" size="sm" bg="light" text="Loading..." />}>
      <RtoWorkspace key={id} recordId={id} />
    </Suspense>
  );
}
