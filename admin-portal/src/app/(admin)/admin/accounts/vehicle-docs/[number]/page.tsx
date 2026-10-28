'use client';

import { useParams } from 'next/navigation';
import VehicleDocsDetail from '@/components/vehicleDocs/VehicleDocsDetail';

export default function VehicleDocsDetailPage() {
  const params = useParams<{ number: string }>();
  return <VehicleDocsDetail number={decodeURIComponent(params.number)} />;
}
