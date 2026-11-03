'use client';

import AdminVehicleIdentityHint from '@/components/listings/VehicleIdentityHint';

export default function VehicleIdentityHint(props: {
  check: Parameters<typeof AdminVehicleIdentityHint>[0]['check'];
  ready: boolean;
  isChecking: boolean;
  label: string;
}) {
  return <AdminVehicleIdentityHint {...props} result={null} listingBasePath="/partner/listings" />;
}
