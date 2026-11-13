'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { UnifiedHistoryPanel } from '@/components/identityHub/IdentityHubPage';
import { useAuthStore } from '@/store/authStore';
import { useHeaderStore } from '@/store/headerStore';
import {
  AADHAAR_DIGILOCKER_VIEW_PERMISSIONS,
  canViewFeature,
  GST_VIEW_PERMISSIONS,
  PAN_VIEW_PERMISSIONS,
} from '@/lib/featurePermissions';

/** Every identity verification (PAN, GST, Aadhaar), paginated. */
export default function IdentityHistoryPage() {
  const router = useRouter();
  const { user } = useAuthStore();
  const setCustomHeader = useHeaderStore((state) => state.setCustomHeader);
  const basePath = user?.role === 'EMPLOYEE' ? '/employee/identity-hub' : '/admin/identity-hub';
  const accessDeniedHref = user?.role === 'EMPLOYEE' ? '/employee/dashboard' : '/admin/dashboard';
  const canView = [
    PAN_VIEW_PERMISSIONS,
    GST_VIEW_PERMISSIONS,
    AADHAAR_DIGILOCKER_VIEW_PERMISSIONS,
  ].some((permissions) => canViewFeature(user?.role, user?.permissions, permissions));

  useEffect(() => {
    if (user && !canView) router.replace(accessDeniedHref);
  }, [accessDeniedHref, canView, router, user]);

  useEffect(() => {
    setCustomHeader(<h1 className="font-bold text-[17px] sm:text-xl text-gray-900 truncate">Identity Verification History</h1>);
    return () => setCustomHeader(null);
  }, [setCustomHeader]);

  if (!canView) return null;

  return (
    <div className="space-y-3">
      <Link
        href={basePath}
        className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-bold text-slate-700 shadow-2xs transition hover:border-slate-900 hover:bg-slate-900 hover:text-white"
      >
        <ArrowLeft className="h-3.5 w-3.5" /> Back to Identity Hub
      </Link>
      <UnifiedHistoryPanel variant="full" activeTab="overview" />
    </div>
  );
}
