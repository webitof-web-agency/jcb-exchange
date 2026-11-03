'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import UnifiedVehicleHistoryPanel from '@/components/vehicleTransport/UnifiedVehicleHistoryPanel';
import { useAuthStore } from '@/store/authStore';
import { useHeaderStore } from '@/store/headerStore';
import {
  canViewFeature,
  CHASSIS_TO_RC_VIEW_PERMISSIONS,
  DRIVING_LICENSE_VIEW_PERMISSIONS,
  RC_CHALLAN_VIEW_PERMISSIONS,
  RC_OWNER_HISTORY_VIEW_PERMISSIONS,
  RC_TO_MOBILE_VIEW_PERMISSIONS,
} from '@/lib/featurePermissions';

/** Every vehicle verification (RC, challan, DL, chassis, RC to mobile), paginated. */
export default function VehicleHistoryPage() {
  const router = useRouter();
  const { user } = useAuthStore();
  const setCustomHeader = useHeaderStore((state) => state.setCustomHeader);
  const basePath = user?.role === 'EMPLOYEE' ? '/employee/vehicle-transport' : '/admin/vehicle-transport';
  const accessDeniedHref = user?.role === 'EMPLOYEE' ? '/employee/dashboard' : '/admin/dashboard';
  const canView = [
    DRIVING_LICENSE_VIEW_PERMISSIONS,
    RC_OWNER_HISTORY_VIEW_PERMISSIONS,
    RC_CHALLAN_VIEW_PERMISSIONS,
    CHASSIS_TO_RC_VIEW_PERMISSIONS,
    RC_TO_MOBILE_VIEW_PERMISSIONS,
  ].some((permissions) => canViewFeature(user?.role, user?.permissions, permissions));

  useEffect(() => {
    if (user && !canView) router.replace(accessDeniedHref);
  }, [accessDeniedHref, canView, router, user]);

  useEffect(() => {
    setCustomHeader(<h1 className="font-bold text-[17px] sm:text-xl text-gray-900 truncate">Vehicle Verification History</h1>);
    return () => setCustomHeader(null);
  }, [setCustomHeader]);

  return (
    <div className="space-y-3">
      <Link
        href={basePath}
        className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-bold text-slate-700 shadow-2xs transition hover:border-slate-900 hover:bg-slate-900 hover:text-white"
      >
        <ArrowLeft className="h-3.5 w-3.5" /> Back to Vehicle &amp; Transport
      </Link>
      <UnifiedVehicleHistoryPanel
        variant="full"
        onSelectService={(service) => router.push(`${basePath}?service=${service}`)}
      />
    </div>
  );
}
