'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  CarFront,
  FileCheck2,
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  FileWarning,
  ScanSearch,
  Zap,
  ShieldCheck,
  Database,
  Layers,
} from 'lucide-react';
import DrivingLicenseVerificationPage from '@/components/drivingLicenseVerification/DrivingLicenseVerificationPage';
import RcOwnerHistoryPage from '@/components/rcOwnerHistory/RcOwnerHistoryPage';
import RcChallanVerificationPage from '@/components/rcChallanVerification/RcChallanVerificationPage';
import ChassisToRcVerificationPage from '@/components/chassisToRcVerification/ChassisToRcVerificationPage';
import RcToMobileVerificationPage from '@/components/rcToMobileVerification/RcToMobileVerificationPage';
import UnifiedVehicleHistoryPanel from '@/components/vehicleTransport/UnifiedVehicleHistoryPanel';
import { useAuthStore } from '@/store/authStore';
import { useHeaderStore } from '@/store/headerStore';
import { useApiBillingSummary } from '@/hooks/useApiBillingSummary';
import { ApiServicePrice } from '@/components/apiBilling/ApiBillingDisplay';
import {
  canViewFeature,
  DRIVING_LICENSE_VIEW_PERMISSIONS,
  RC_OWNER_HISTORY_VIEW_PERMISSIONS,
  RC_CHALLAN_VIEW_PERMISSIONS,
  CHASSIS_TO_RC_VIEW_PERMISSIONS,
  RC_TO_MOBILE_VIEW_PERMISSIONS,
} from '@/lib/featurePermissions';

type Service = 'none' | 'driving-license' | 'rc-owner-history' | 'rc-challan' | 'chassis-to-rc' | 'rc-to-mobile';

const SERVICES: Service[] = ['driving-license', 'rc-owner-history', 'rc-challan', 'chassis-to-rc', 'rc-to-mobile'];

export default function VehicleTransportPage() {
  const router = useRouter();
  const [service, setService] = useState<Service>('none');
  const [totalCount, setTotalCount] = useState<number>(0);
  const { user } = useAuthStore();
  const permissions = user?.permissions;
  const accessDeniedHref = user?.role === 'EMPLOYEE' ? '/employee/dashboard' : '/admin/dashboard';
  const basePath = user?.role === 'EMPLOYEE' ? '/employee/vehicle-transport' : '/admin/vehicle-transport';
  const setCustomHeader = useHeaderStore((state) => state.setCustomHeader);
  const billing = useApiBillingSummary();

  const canAccessDrivingLicense = canViewFeature(user?.role, permissions, DRIVING_LICENSE_VIEW_PERMISSIONS);
  const canAccessRcOwnerHistory = canViewFeature(user?.role, permissions, RC_OWNER_HISTORY_VIEW_PERMISSIONS);
  const canAccessRcChallan = canViewFeature(user?.role, permissions, RC_CHALLAN_VIEW_PERMISSIONS);
  const canAccessChassisToRc = canViewFeature(user?.role, permissions, CHASSIS_TO_RC_VIEW_PERMISSIONS);
  const canAccessRcToMobile = canViewFeature(user?.role, permissions, RC_TO_MOBILE_VIEW_PERMISSIONS);

  useEffect(() => {
    if (!canAccessDrivingLicense && !canAccessRcOwnerHistory && !canAccessRcChallan && !canAccessChassisToRc && !canAccessRcToMobile) {
      router.replace(accessDeniedHref);
      return;
    }
  }, [accessDeniedHref, canAccessChassisToRc, canAccessDrivingLicense, canAccessRcChallan, canAccessRcOwnerHistory, canAccessRcToMobile, router]);

  // "Open" on the full history page links here with ?service=…; open that service, then drop the param.
  useEffect(() => {
    const requested = new URLSearchParams(window.location.search).get('service') as Service | null;
    if (!requested || !SERVICES.includes(requested)) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setService(requested);
    window.history.replaceState(null, '', window.location.pathname);
  }, []);

  useEffect(() => {
    if (service === 'driving-license') {
      setCustomHeader(
        <h1 className="font-bold text-[17px] sm:text-xl text-gray-900 truncate">
          Driving License Verification
        </h1>
      );
    } else if (service === 'rc-owner-history') {
      setCustomHeader(
        <h1 className="font-bold text-[17px] sm:text-xl text-gray-900 truncate">
          RC Owner History
        </h1>
      );
    } else if (service === 'rc-challan') {
      setCustomHeader(
        <h1 className="font-bold text-[17px] sm:text-xl text-gray-900 truncate">
          RC Challan
        </h1>
      );
    } else if (service === 'chassis-to-rc') {
      setCustomHeader(
        <h1 className="font-bold text-[17px] sm:text-xl text-gray-900 truncate">
          Chassis to RC Details
        </h1>
      );
    } else if (service === 'rc-to-mobile') {
      setCustomHeader(
        <h1 className="font-bold text-[17px] sm:text-xl text-gray-900 truncate">
          RC to Mobile
        </h1>
      );
    } else {
      setCustomHeader(null);
    }

    return () => {
      setCustomHeader(null);
    };
  }, [service, setCustomHeader]);

  // Sub-navigation shown inside each verification service. A JSX value, not a component defined in
  // render, so it is not remounted on every render.
  const subNavBar = (
    <div className="flex flex-wrap items-center justify-between gap-2.5 rounded-xl border border-slate-200 bg-white p-2.5 shadow-2xs">
      <button
        type="button"
        onClick={() => setService('none')}
        className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-bold text-slate-700 shadow-2xs transition hover:border-slate-900 hover:bg-slate-900 hover:text-white"
      >
        <ArrowLeft className="h-3.5 w-3.5" /> Back to Services
      </button>

      <div className="flex flex-wrap items-center gap-1">
        {canAccessDrivingLicense && (
          <button
            type="button"
            onClick={() => setService('driving-license')}
            className={`rounded-lg px-2.5 py-1 text-xs font-bold transition ${
              service === 'driving-license'
                ? 'bg-amber-500 text-slate-950 shadow-xs'
                : 'text-slate-600 hover:bg-slate-100'
            }`}
          >
            Driving License
          </button>
        )}
        {canAccessRcOwnerHistory && (
          <button
            type="button"
            onClick={() => setService('rc-owner-history')}
            className={`rounded-lg px-2.5 py-1 text-xs font-bold transition ${
              service === 'rc-owner-history'
                ? 'bg-violet-600 text-white shadow-xs'
                : 'text-slate-600 hover:bg-slate-100'
            }`}
          >
            RC Owner History
          </button>
        )}
        {canAccessRcToMobile && (
          <button
            type="button"
            onClick={() => setService('rc-to-mobile')}
            className={`rounded-lg px-2.5 py-1 text-xs font-bold transition ${
              service === 'rc-to-mobile'
                ? 'bg-blue-600 text-white shadow-xs'
                : 'text-slate-600 hover:bg-slate-100'
            }`}
          >
            RC to Mobile
          </button>
        )}
        {canAccessRcChallan && (
          <button
            type="button"
            onClick={() => setService('rc-challan')}
            className={`rounded-lg px-2.5 py-1 text-xs font-bold transition ${
              service === 'rc-challan'
                ? 'bg-rose-600 text-white shadow-xs'
                : 'text-slate-600 hover:bg-slate-100'
            }`}
          >
            RC Challan
          </button>
        )}
        {canAccessChassisToRc && (
          <button
            type="button"
            onClick={() => setService('chassis-to-rc')}
            className={`rounded-lg px-2.5 py-1 text-xs font-bold transition ${
              service === 'chassis-to-rc'
                ? 'bg-cyan-700 text-white shadow-xs'
                : 'text-slate-600 hover:bg-slate-100'
            }`}
          >
            Chassis to RC
          </button>
        )}
      </div>
    </div>
  );

  if (service === 'driving-license' && canAccessDrivingLicense) {
    return (
      <div className="space-y-4 animate-in fade-in duration-300">
        {subNavBar}
        <DrivingLicenseVerificationPage embedded />
      </div>
    );
  }

  if (service === 'rc-owner-history' && canAccessRcOwnerHistory) {
    return (
      <div className="space-y-4 animate-in fade-in duration-300">
        {subNavBar}
        <RcOwnerHistoryPage embedded />
      </div>
    );
  }

  if (service === 'rc-challan' && canAccessRcChallan) {
    return (
      <div className="space-y-4 animate-in fade-in duration-300">
        {subNavBar}
        <RcChallanVerificationPage embedded />
      </div>
    );
  }

  if (service === 'chassis-to-rc' && canAccessChassisToRc) {
    return (
      <div className="space-y-4 animate-in fade-in duration-300">
        {subNavBar}
        <ChassisToRcVerificationPage embedded />
      </div>
    );
  }

  if (service === 'rc-to-mobile' && canAccessRcToMobile) {
    return (
      <div className="space-y-4 animate-in fade-in duration-300">
        {subNavBar}
        <RcToMobileVerificationPage embedded />
      </div>
    );
  }

  return (
    <div className="space-y-4 animate-in fade-in duration-300">
      {/* Executive Header & KPI Ribbon */}
      <div className="rounded-2xl border border-slate-200 bg-white p-4 sm:p-5 shadow-2xs">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between border-b border-slate-100 pb-4">
          <div>
            <div className="flex items-center gap-2">
              <span className="flex h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
              <span className="text-[11px] font-bold uppercase tracking-wider text-emerald-700">
                Parivahan &amp; Surepass Gateway Connected
              </span>
            </div>
            <h1 className="mt-1 text-lg sm:text-xl font-black text-slate-900 tracking-tight">
              Vehicle &amp; Transport Operations Hub
            </h1>
            <p className="text-xs text-slate-500 mt-0.5">
              Instant RTO vehicle registration, owner history, national traffic challans, chassis audit &amp; driving licenses.
            </p>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-200/80 bg-emerald-50 px-3 py-1 text-xs font-bold text-emerald-800">
              <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
              100% Operational
            </span>
          </div>
        </div>

        {/* 4 Compact Metric Cards */}
        <div className="mt-4 grid grid-cols-2 gap-2.5 sm:grid-cols-4 sm:gap-3">
          <div className="rounded-xl border border-slate-100 bg-slate-50/70 p-3">
            <div className="flex items-center justify-between text-slate-500">
              <span className="text-[11px] font-bold uppercase tracking-wide">Transport Checks</span>
              <Database className="h-4 w-4 text-amber-600" />
            </div>
            <div className="mt-1 font-mono text-lg font-black text-slate-900">
              {totalCount > 0 ? totalCount : 'Active'}
            </div>
            <p className="text-[10px] text-slate-500 mt-0.5">Live database records</p>
          </div>

          <div className="rounded-xl border border-slate-100 bg-slate-50/70 p-3">
            <div className="flex items-center justify-between text-slate-500">
              <span className="text-[11px] font-bold uppercase tracking-wide">RTO Modules</span>
              <Layers className="h-4 w-4 text-violet-600" />
            </div>
            <div className="mt-1 font-mono text-lg font-black text-slate-900">
              5 Services
            </div>
            <p className="text-[10px] text-slate-500 mt-0.5">RC, Challan, DL, Chassis</p>
          </div>

          <div className="rounded-xl border border-slate-100 bg-slate-50/70 p-3">
            <div className="flex items-center justify-between text-slate-500">
              <span className="text-[11px] font-bold uppercase tracking-wide">Cache Mode</span>
              <ShieldCheck className="h-4 w-4 text-emerald-600" />
            </div>
            <div className="mt-1 text-lg font-black text-emerald-700">
              24h Cache
            </div>
            <p className="text-[10px] text-slate-500 mt-0.5">Saves duplicate charges</p>
          </div>

          <div className="rounded-xl border border-slate-100 bg-slate-50/70 p-3">
            <div className="flex items-center justify-between text-slate-500">
              <span className="text-[11px] font-bold uppercase tracking-wide">Coverage</span>
              <Zap className="h-4 w-4 text-blue-600" />
            </div>
            <div className="mt-1 text-lg font-black text-slate-900">
              Pan-India
            </div>
            <p className="text-[10px] text-slate-500 mt-0.5">All 36 States &amp; UTs</p>
          </div>
        </div>
      </div>

      {/* Service Cards Grid - High Density 5-column layout */}
      <div className="grid grid-cols-2 gap-2.5 sm:gap-3.5 md:grid-cols-3 lg:grid-cols-5">
        {/* Card 1: Driving License */}
        {canAccessDrivingLicense && (
          <div
            onClick={() => setService('driving-license')}
            className="group relative cursor-pointer overflow-hidden rounded-xl border border-slate-200 bg-white p-3.5 shadow-2xs transition-all duration-200 hover:-translate-y-0.5 hover:border-amber-500 hover:shadow-md flex flex-col justify-between"
          >
            <div>
              <div className="flex items-center justify-between gap-1">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-amber-500/10 text-amber-600 transition-colors group-hover:bg-amber-500 group-hover:text-slate-950">
                  <FileCheck2 className="h-4 w-4" />
                </div>
                <span className="inline-flex items-center gap-1 rounded-full border border-amber-200/60 bg-amber-50 px-2 py-0.5 text-[10px] font-bold text-amber-800 truncate">
                  <CheckCircle2 className="h-2.5 w-2.5 shrink-0" /> DL Check
                </span>
              </div>

              <div className="mt-3">
                <h2 className="text-xs sm:text-sm font-bold text-slate-950 group-hover:text-amber-600 transition-colors leading-snug">
                  Driving License
                </h2>
                <p className="mt-1 text-[11px] text-slate-500 line-clamp-2">
                  Verify validity, vehicle authorization classes &amp; holder details.
                </p>
              </div>
            </div>

            <div className="mt-3 flex items-center justify-between border-t border-slate-100 pt-2.5">
              <ApiServicePrice summary={billing.summary} serviceKey="DRIVING_LICENSE_VERIFICATION" />
              <ArrowRight className="h-3.5 w-3.5 text-slate-400 group-hover:text-amber-600 transition-transform group-hover:translate-x-1 shrink-0" />
            </div>
          </div>
        )}

        {/* Card 2: RC Owner History */}
        {canAccessRcOwnerHistory && (
          <div
            onClick={() => setService('rc-owner-history')}
            className="group relative cursor-pointer overflow-hidden rounded-xl border border-slate-200 bg-white p-3.5 shadow-2xs transition-all duration-200 hover:-translate-y-0.5 hover:border-violet-500 hover:shadow-md flex flex-col justify-between"
          >
            <div>
              <div className="flex items-center justify-between gap-1">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-violet-500/10 text-violet-600 transition-colors group-hover:bg-violet-600 group-hover:text-white">
                  <FileCheck2 className="h-4 w-4" />
                </div>
                <span className="inline-flex items-center gap-1 rounded-full border border-violet-200/60 bg-violet-50 px-2 py-0.5 text-[10px] font-bold text-violet-800 truncate">
                  <CheckCircle2 className="h-2.5 w-2.5 shrink-0" /> RC Owner
                </span>
              </div>

              <div className="mt-3">
                <h2 className="text-xs sm:text-sm font-bold text-slate-950 group-hover:text-violet-600 transition-colors leading-snug">
                  RC Owner History
                </h2>
                <p className="mt-1 text-[11px] text-slate-500 line-clamp-2">
                  Complete registration, ownership serial, fitness &amp; insurance status.
                </p>
              </div>
            </div>

            <div className="mt-3 flex items-center justify-between border-t border-slate-100 pt-2.5">
              <ApiServicePrice summary={billing.summary} serviceKey="RC_OWNER_HISTORY" />
              <ArrowRight className="h-3.5 w-3.5 text-slate-400 group-hover:text-violet-600 transition-transform group-hover:translate-x-1 shrink-0" />
            </div>
          </div>
        )}

        {/* Card 3: RC to Mobile */}
        {canAccessRcToMobile && (
          <div
            onClick={() => setService('rc-to-mobile')}
            className="group relative cursor-pointer overflow-hidden rounded-xl border border-slate-200 bg-white p-3.5 shadow-2xs transition-all duration-200 hover:-translate-y-0.5 hover:border-blue-500 hover:shadow-md flex flex-col justify-between"
          >
            <div>
              <div className="flex items-center justify-between gap-1">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-blue-500/10 text-blue-600 transition-colors group-hover:bg-blue-600 group-hover:text-white">
                  <CarFront className="h-4 w-4" />
                </div>
                <span className="inline-flex items-center gap-1 rounded-full border border-blue-200/60 bg-blue-50 px-2 py-0.5 text-[10px] font-bold text-blue-800 truncate">
                  <CheckCircle2 className="h-2.5 w-2.5 shrink-0" /> RC Mobile
                </span>
              </div>

              <div className="mt-3">
                <h2 className="text-xs sm:text-sm font-bold text-slate-950 group-hover:text-blue-600 transition-colors leading-snug">
                  RC to Mobile
                </h2>
                <p className="mt-1 text-[11px] text-slate-500 line-clamp-2">
                  Retrieve linked registered mobile contact number for an RC plate.
                </p>
              </div>
            </div>

            <div className="mt-3 flex items-center justify-between border-t border-slate-100 pt-2.5">
              <ApiServicePrice summary={billing.summary} serviceKey="RC_TO_MOBILE" />
              <ArrowRight className="h-3.5 w-3.5 text-slate-400 group-hover:text-blue-600 transition-transform group-hover:translate-x-1 shrink-0" />
            </div>
          </div>
        )}

        {/* Card 4: RC Challan */}
        {canAccessRcChallan && (
          <div
            onClick={() => setService('rc-challan')}
            className="group relative cursor-pointer overflow-hidden rounded-xl border border-slate-200 bg-white p-3.5 shadow-2xs transition-all duration-200 hover:-translate-y-0.5 hover:border-rose-500 hover:shadow-md flex flex-col justify-between"
          >
            <div>
              <div className="flex items-center justify-between gap-1">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-rose-500/10 text-rose-600 transition-colors group-hover:bg-rose-600 group-hover:text-white">
                  <FileWarning className="h-4 w-4" />
                </div>
                <span className="inline-flex items-center gap-1 rounded-full border border-rose-200/60 bg-rose-50 px-2 py-0.5 text-[10px] font-bold text-rose-800 truncate">
                  <CheckCircle2 className="h-2.5 w-2.5 shrink-0" /> Challans
                </span>
              </div>

              <div className="mt-3">
                <h2 className="text-xs sm:text-sm font-bold text-slate-950 group-hover:text-rose-600 transition-colors leading-snug">
                  RC Challan
                </h2>
                <p className="mt-1 text-[11px] text-slate-500 line-clamp-2">
                  Active traffic fines, court cases, violation spots &amp; blacklist status.
                </p>
              </div>
            </div>

            <div className="mt-3 flex items-center justify-between border-t border-slate-100 pt-2.5">
              <ApiServicePrice summary={billing.summary} serviceKey="RC_CHALLAN" />
              <ArrowRight className="h-3.5 w-3.5 text-slate-400 group-hover:text-rose-600 transition-transform group-hover:translate-x-1 shrink-0" />
            </div>
          </div>
        )}

        {/* Card 5: Chassis to RC */}
        {canAccessChassisToRc && (
          <div
            onClick={() => setService('chassis-to-rc')}
            className="group relative cursor-pointer overflow-hidden rounded-xl border border-slate-200 bg-white p-3.5 shadow-2xs transition-all duration-200 hover:-translate-y-0.5 hover:border-cyan-500 hover:shadow-md flex flex-col justify-between"
          >
            <div>
              <div className="flex items-center justify-between gap-1">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-cyan-500/10 text-cyan-700 transition-colors group-hover:bg-cyan-700 group-hover:text-white">
                  <ScanSearch className="h-4 w-4" />
                </div>
                <span className="inline-flex items-center gap-1 rounded-full border border-cyan-200/60 bg-cyan-50 px-2 py-0.5 text-[10px] font-bold text-cyan-800 truncate">
                  <CheckCircle2 className="h-2.5 w-2.5 shrink-0" /> Chassis
                </span>
              </div>

              <div className="mt-3">
                <h2 className="text-xs sm:text-sm font-bold text-slate-950 group-hover:text-cyan-700 transition-colors leading-snug">
                  Chassis to RC
                </h2>
                <p className="mt-1 text-[11px] text-slate-500 line-clamp-2">
                  Lookup vehicle registration &amp; owner details from chassis VIN number.
                </p>
              </div>
            </div>

            <div className="mt-3 flex items-center justify-between border-t border-slate-100 pt-2.5">
              <ApiServicePrice summary={billing.summary} serviceKey="CHASSIS_TO_RC" />
              <ArrowRight className="h-3.5 w-3.5 text-slate-400 group-hover:text-cyan-700 transition-transform group-hover:translate-x-1 shrink-0" />
            </div>
          </div>
        )}
      </div>

      {/* Unified Live Vehicle Verification History Table */}
      <UnifiedVehicleHistoryPanel
        onSelectService={(targetService) => setService(targetService)}
        onTotalCountChange={(cnt) => setTotalCount(cnt)}
        allHistoryHref={`${basePath}/history`}
      />

      {/* Empty State if user has zero permissions */}
      {!canAccessDrivingLicense && !canAccessRcOwnerHistory && !canAccessRcChallan && !canAccessChassisToRc && !canAccessRcToMobile && (
        <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-slate-300 bg-white py-16 text-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-slate-100 text-slate-400">
            <FileWarning className="h-6 w-6" />
          </div>
          <h3 className="mt-4 text-lg font-bold text-slate-900">No Services Available</h3>
          <p className="mt-2 text-sm text-slate-500">
            You do not have permission to access any vehicle or transport services.
          </p>
        </div>
      )}
    </div>
  );
}
