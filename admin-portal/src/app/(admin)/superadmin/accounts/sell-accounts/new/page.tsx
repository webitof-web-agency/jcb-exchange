'use client';

import { Suspense } from 'react';
import BrandLoader from '@/components/ui/BrandLoader';
import SoldVehicleForm from '@/components/accounts/sold-vehicle/SoldVehicleForm';

export default function NewSoldVehiclePage() {
  return (
    <Suspense fallback={<BrandLoader variant="section" size="sm" bg="light" text="Loading..." />}>
      <SoldVehicleForm />
    </Suspense>
  );
}
