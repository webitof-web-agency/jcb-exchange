'use client';

import { Suspense } from 'react';
import { useParams } from 'next/navigation';
import BrandLoader from '@/components/ui/BrandLoader';
import SoldVehicleForm from '@/components/accounts/sold-vehicle/SoldVehicleForm';

export default function EditSoldVehiclePage() {
  const params = useParams();
  const id = decodeURIComponent(String(params?.id || ''));
  return (
    <Suspense fallback={<BrandLoader variant="section" size="sm" bg="light" text="Loading..." />}>
      <SoldVehicleForm key={id} recordId={id} />
    </Suspense>
  );
}
