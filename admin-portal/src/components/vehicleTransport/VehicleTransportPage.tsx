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
  Phone,
  ListChecks,
} from 'lucide-react';
import DrivingLicenseVerificationPage from '@/components/drivingLicenseVerification/DrivingLicenseVerificationPage';
import RcOwnerHistoryPage from '@/components/rcOwnerHistory/RcOwnerHistoryPage';
import RcFullPage from '@/components/rcFull/RcFullPage';
import RcChallanVerificationPage from '@/components/rcChallanVerification/RcChallanVerificationPage';
import ChassisToRcVerificationPage from '@/components/chassisToRcVerification/ChassisToRcVerificationPage';
import RcToMobileVerificationPage from '@/components/rcToMobileVerification/RcToMobileVerificationPage';
import MobileToRcLookupPage from '@/components/mobileToRcLookup/MobileToRcLookupPage';
import RcMobileNumberCheckPage from '@/components/rcMobileNumberCheck/RcMobileNumberCheckPage';
import { useAuthStore } from '@/store/authStore';
import { useHeaderStore } from '@/store/headerStore';
import { useApiBillingSummary } from '@/hooks/useApiBillingSummary';
import { ApiServicePrice } from '@/components/apiBilling/ApiBillingDisplay';
import {
  canViewFeature,
  DRIVING_LICENSE_VIEW_PERMISSIONS,
  RC_OWNER_HISTORY_VIEW_PERMISSIONS,
  RC_FULL_VIEW_PERMISSIONS,
  RC_CHALLAN_VIEW_PERMISSIONS,
  CHASSIS_TO_RC_VIEW_PERMISSIONS,
  RC_TO_MOBILE_VIEW_PERMISSIONS,
  MOBILE_TO_RC_VIEW_PERMISSIONS,
  RC_MOBILE_NUMBER_CHECK_VIEW_PERMISSIONS,
} from '@/lib/featurePermissions';

type Service = 'none' | 'driving-license' | 'rc-owner-history' | 'rc-full' | 'rc-challan' | 'chassis-to-rc' | 'rc-to-mobile' | 'mobile-to-rc' | 'rc-mobile-number-check';

export default function VehicleTransportPage() {
  const router = useRouter();
  const [service, setService] = useState<Service>('none');
  const { user } = useAuthStore();
  const permissions = user?.permissions;
  const accessDeniedHref = user?.role === 'EMPLOYEE' ? '/employee/dashboard' : '/admin/dashboard';
  const setCustomHeader = useHeaderStore((state) => state.setCustomHeader);
  const billing = useApiBillingSummary();

  const canAccessDrivingLicense = canViewFeature(user?.role, permissions, DRIVING_LICENSE_VIEW_PERMISSIONS);
  const canAccessRcOwnerHistory = canViewFeature(user?.role, permissions, RC_OWNER_HISTORY_VIEW_PERMISSIONS);
  const canAccessRcFull = canViewFeature(user?.role, permissions, RC_FULL_VIEW_PERMISSIONS);
  const canAccessRcChallan = canViewFeature(user?.role, permissions, RC_CHALLAN_VIEW_PERMISSIONS);
  const canAccessChassisToRc = canViewFeature(user?.role, permissions, CHASSIS_TO_RC_VIEW_PERMISSIONS);
  const canAccessRcToMobile = canViewFeature(user?.role, permissions, RC_TO_MOBILE_VIEW_PERMISSIONS);
  const canAccessMobileToRc = canViewFeature(user?.role, permissions, MOBILE_TO_RC_VIEW_PERMISSIONS);
  const canAccessRcMobileNumberCheck = canViewFeature(user?.role, permissions, RC_MOBILE_NUMBER_CHECK_VIEW_PERMISSIONS);
  useEffect(() => {
    if (!canAccessDrivingLicense && !canAccessRcOwnerHistory && !canAccessRcFull && !canAccessRcChallan && !canAccessChassisToRc && !canAccessRcToMobile && !canAccessMobileToRc && !canAccessRcMobileNumberCheck) {
      router.replace(accessDeniedHref);
      return;
    }
  }, [accessDeniedHref, canAccessChassisToRc, canAccessDrivingLicense, canAccessMobileToRc, canAccessRcChallan, canAccessRcFull, canAccessRcMobileNumberCheck, canAccessRcOwnerHistory, canAccessRcToMobile, router]);

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
    } else if (service === 'rc-full') {
      setCustomHeader(
        <h1 className="font-bold text-[17px] sm:text-xl text-gray-900 truncate">
          RC Full
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
    } else if (service === 'mobile-to-rc') {
      setCustomHeader(
        <h1 className="font-bold text-[17px] sm:text-xl text-gray-900 truncate">
          Mobile To RC
        </h1>
      );
    } else if (service === 'rc-mobile-number-check') {
      setCustomHeader(
        <h1 className="font-bold text-[17px] sm:text-xl text-gray-900 truncate">
          RC Mobile Number Check
        </h1>
      );
    } else {
      setCustomHeader(null);
    }

    return () => {
      setCustomHeader(null);
    };
  }, [service, setCustomHeader]);

  if (service === 'driving-license' && canAccessDrivingLicense) {
    return (
      <div className="space-y-6 animate-in fade-in duration-300">
        <div>
          <button
            type="button"
            onClick={() => setService('none')}
            className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3.5 py-2 text-xs font-bold text-slate-700 shadow-sm transition hover:bg-slate-900 hover:text-white hover:border-slate-900"
          >
            <ArrowLeft className="h-4 w-4" /> Back to Services
          </button>
        </div>
        <DrivingLicenseVerificationPage embedded />
      </div>
    );
  }

  if (service === 'rc-owner-history' && canAccessRcOwnerHistory) {
    return (
      <div className="space-y-6 animate-in fade-in duration-300">
        <div>
          <button
            type="button"
            onClick={() => setService('none')}
            className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3.5 py-2 text-xs font-bold text-slate-700 shadow-sm transition hover:bg-slate-900 hover:text-white hover:border-slate-900"
          >
            <ArrowLeft className="h-4 w-4" /> Back to Services
          </button>
        </div>
        <RcOwnerHistoryPage embedded />
      </div>
    );
  }

  if (service === 'rc-full' && canAccessRcFull) {
    return (
      <div className="space-y-6 animate-in fade-in duration-300">
        <div>
          <button
            type="button"
            onClick={() => setService('none')}
            className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3.5 py-2 text-xs font-bold text-slate-700 shadow-sm transition hover:bg-slate-900 hover:text-white hover:border-slate-900"
          >
            <ArrowLeft className="h-4 w-4" /> Back to Services
          </button>
        </div>
        <RcFullPage embedded />
      </div>
    );
  }

  if (service === 'rc-challan' && canAccessRcChallan) {
    return (
      <div className="space-y-6 animate-in fade-in duration-300">
        <div>
          <button
            type="button"
            onClick={() => setService('none')}
            className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3.5 py-2 text-xs font-bold text-slate-700 shadow-sm transition hover:bg-slate-900 hover:text-white hover:border-slate-900"
          >
            <ArrowLeft className="h-4 w-4" /> Back to Services
          </button>
        </div>
        <RcChallanVerificationPage embedded />
      </div>
    );
  }

  if (service === 'chassis-to-rc' && canAccessChassisToRc) {
    return (
      <div className="space-y-6 animate-in fade-in duration-300">
        <div>
          <button
            type="button"
            onClick={() => setService('none')}
            className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3.5 py-2 text-xs font-bold text-slate-700 shadow-sm transition hover:bg-slate-900 hover:text-white hover:border-slate-900"
          >
            <ArrowLeft className="h-4 w-4" /> Back to Services
          </button>
        </div>
        <ChassisToRcVerificationPage embedded />
      </div>
    );
  }

  if (service === 'rc-to-mobile' && canAccessRcToMobile) {
    return (
      <div className="space-y-6 animate-in fade-in duration-300">
        <div>
          <button
            type="button"
            onClick={() => setService('none')}
            className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3.5 py-2 text-xs font-bold text-slate-700 shadow-sm transition hover:bg-slate-900 hover:text-white hover:border-slate-900"
          >
            <ArrowLeft className="h-4 w-4" /> Back to Services
          </button>
        </div>
        <RcToMobileVerificationPage embedded />
      </div>
    );
  }

  if (service === 'mobile-to-rc' && canAccessMobileToRc) {
    return (
      <div className="space-y-6 animate-in fade-in duration-300">
        <div>
          <button
            type="button"
            onClick={() => setService('none')}
            className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3.5 py-2 text-xs font-bold text-slate-700 shadow-sm transition hover:bg-slate-900 hover:text-white hover:border-slate-900"
          >
            <ArrowLeft className="h-4 w-4" /> Back to Services
          </button>
        </div>
        <MobileToRcLookupPage embedded />
      </div>
    );
  }

  if (service === 'rc-mobile-number-check' && canAccessRcMobileNumberCheck) {
    return (
      <div className="space-y-6 animate-in fade-in duration-300">
        <div>
          <button
            type="button"
            onClick={() => setService('none')}
            className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3.5 py-2 text-xs font-bold text-slate-700 shadow-sm transition hover:bg-slate-900 hover:text-white hover:border-slate-900"
          >
            <ArrowLeft className="h-4 w-4" /> Back to Services
          </button>
        </div>
        <RcMobileNumberCheckPage embedded />
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      {/* Service Cards Grid */}
      <div className="grid grid-cols-2 gap-2.5 sm:gap-4 lg:grid-cols-3">
        {/* Card 1: Driving License Verification */}
        {canAccessDrivingLicense && (
        <div
          onClick={() => setService('driving-license')}
          className="group relative cursor-pointer overflow-hidden rounded-xl sm:rounded-2xl border border-slate-200 bg-white p-3.5 sm:p-5 shadow-sm transition-all duration-300 hover:-translate-y-1 hover:border-amber-500 hover:shadow-md flex flex-col justify-between"
        >
          <div>
            <div className="flex items-center justify-between gap-1">
              <div className="flex h-8 w-8 sm:h-10 sm:w-10 shrink-0 items-center justify-center rounded-lg sm:rounded-xl bg-amber-500/10 text-amber-600 transition-colors group-hover:bg-amber-500 group-hover:text-slate-950">
                <FileCheck2 className="h-4 w-4 sm:h-5 sm:w-5" />
              </div>
              <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-1.5 py-0.5 sm:px-2.5 sm:py-0.5 text-[9px] sm:text-xs font-semibold text-amber-800 border border-amber-200/60 truncate max-w-[95px] sm:max-w-none">
                <CheckCircle2 className="h-2.5 w-2.5 sm:h-3 sm:w-3 shrink-0" /> DL Verification
              </span>
            </div>

            <div className="mt-3 sm:mt-4">
              <h2 className="text-xs sm:text-base font-bold text-slate-950 group-hover:text-amber-600 transition-colors line-clamp-2 leading-snug">
                Driving License Verification
              </h2>
            </div>
          </div>

          <div className="mt-4 flex items-center justify-between border-t border-slate-100/90 pt-3">
            <ApiServicePrice summary={billing.summary} serviceKey="DRIVING_LICENSE_VERIFICATION" />
            <ArrowRight className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-slate-400 group-hover:text-amber-600 transition-transform group-hover:translate-x-1 shrink-0" />
          </div>
        </div>
        )}

        {/* Card 2: RC Owner History */}
        {canAccessRcOwnerHistory && (
        <div
          onClick={() => setService('rc-owner-history')}
          className="group relative cursor-pointer overflow-hidden rounded-xl sm:rounded-2xl border border-slate-200 bg-white p-3.5 sm:p-5 shadow-sm transition-all duration-300 hover:-translate-y-1 hover:border-amber-500 hover:shadow-md flex flex-col justify-between"
        >
          <div>
            <div className="flex items-center justify-between gap-1">
              <div className="flex h-8 w-8 sm:h-10 sm:w-10 shrink-0 items-center justify-center rounded-lg sm:rounded-xl bg-indigo-500/10 text-indigo-600 transition-colors group-hover:bg-amber-500 group-hover:text-slate-950">
                <CarFront className="h-4 w-4 sm:h-5 sm:w-5" />
              </div>
              <span className="inline-flex items-center gap-1 rounded-full bg-indigo-50 px-1.5 py-0.5 sm:px-2.5 sm:py-0.5 text-[9px] sm:text-xs font-semibold text-indigo-800 border border-indigo-200/60 truncate max-w-[95px] sm:max-w-none">
                <CheckCircle2 className="h-2.5 w-2.5 sm:h-3 sm:w-3 shrink-0" /> RC Verification
              </span>
            </div>

            <div className="mt-3 sm:mt-4">
              <h2 className="text-xs sm:text-base font-bold text-slate-950 group-hover:text-amber-600 transition-colors line-clamp-2 leading-snug">
                RC Owner History
              </h2>
            </div>
          </div>

          <div className="mt-4 flex items-center justify-between border-t border-slate-100/90 pt-3">
            <ApiServicePrice summary={billing.summary} serviceKey="RC_OWNER_HISTORY" />
            <ArrowRight className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-slate-400 group-hover:text-amber-600 transition-transform group-hover:translate-x-1 shrink-0" />
          </div>
        </div>
        )}

        {/* Card 3: RC Full */}
        {canAccessRcFull && (
        <div
          onClick={() => setService('rc-full')}
          className="group relative cursor-pointer overflow-hidden rounded-xl sm:rounded-2xl border border-slate-200 bg-white p-3.5 sm:p-5 shadow-sm transition-all duration-300 hover:-translate-y-1 hover:border-amber-500 hover:shadow-md flex flex-col justify-between"
        >
          <div>
            <div className="flex items-center justify-between gap-1">
              <div className="flex h-8 w-8 sm:h-10 sm:w-10 shrink-0 items-center justify-center rounded-lg sm:rounded-xl bg-violet-500/10 text-violet-600 transition-colors group-hover:bg-amber-500 group-hover:text-slate-950">
                <CarFront className="h-4 w-4 sm:h-5 sm:w-5" />
              </div>
              <span className="inline-flex items-center gap-1 rounded-full bg-violet-50 px-1.5 py-0.5 sm:px-2.5 sm:py-0.5 text-[9px] sm:text-xs font-semibold text-violet-800 border border-violet-200/60 truncate max-w-[95px] sm:max-w-none">
                <CheckCircle2 className="h-2.5 w-2.5 sm:h-3 sm:w-3 shrink-0" /> RC Full
              </span>
            </div>

            <div className="mt-3 sm:mt-4">
              <h2 className="text-xs sm:text-base font-bold text-slate-950 group-hover:text-amber-600 transition-colors line-clamp-2 leading-snug">
                RC Full
              </h2>
            </div>
          </div>

          <div className="mt-4 flex items-center justify-between border-t border-slate-100/90 pt-3">
            <ApiServicePrice summary={billing.summary} serviceKey="RC_FULL" />
            <ArrowRight className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-slate-400 group-hover:text-amber-600 transition-transform group-hover:translate-x-1 shrink-0" />
          </div>
        </div>
        )}

        {/* Card 3: RC Challan Verification */}
        {canAccessRcChallan && (
        <div
          onClick={() => setService('rc-challan')}
          className="group relative cursor-pointer overflow-hidden rounded-xl sm:rounded-2xl border border-slate-200 bg-white p-3.5 sm:p-5 shadow-sm transition-all duration-300 hover:-translate-y-1 hover:border-amber-500 hover:shadow-md flex flex-col justify-between"
        >
          <div>
            <div className="flex items-center justify-between gap-1">
              <div className="flex h-8 w-8 sm:h-10 sm:w-10 shrink-0 items-center justify-center rounded-lg sm:rounded-xl bg-red-500/10 text-red-600 transition-colors group-hover:bg-amber-500 group-hover:text-slate-950">
                <FileWarning className="h-4 w-4 sm:h-5 sm:w-5" />
              </div>
              <span className="inline-flex items-center gap-1 rounded-full border border-red-200/60 bg-red-50 px-1.5 py-0.5 sm:px-2.5 sm:py-0.5 text-[9px] sm:text-xs font-semibold text-red-800 truncate max-w-[95px] sm:max-w-none">
                <CheckCircle2 className="h-2.5 w-2.5 sm:h-3 sm:w-3 shrink-0" /> Challan Lookup
              </span>
            </div>

            <div className="mt-3 sm:mt-4">
              <h2 className="text-xs sm:text-base font-bold text-slate-950 transition-colors group-hover:text-amber-600 line-clamp-2 leading-snug">
                RC Challan
              </h2>
            </div>
          </div>

          <div className="mt-4 flex items-center justify-between border-t border-slate-100/90 pt-3">
            <ApiServicePrice summary={billing.summary} serviceKey="RC_CHALLAN" />
            <ArrowRight className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-slate-400 group-hover:text-amber-600 transition-transform group-hover:translate-x-1 shrink-0" />
          </div>
        </div>
        )}

        {/* Card 4: Chassis to RC Details */}
        {canAccessChassisToRc && (
        <div
          onClick={() => setService('chassis-to-rc')}
          className="group relative cursor-pointer overflow-hidden rounded-xl sm:rounded-2xl border border-slate-200 bg-white p-3.5 sm:p-5 shadow-sm transition-all duration-300 hover:-translate-y-1 hover:border-amber-500 hover:shadow-md flex flex-col justify-between"
        >
          <div>
            <div className="flex items-center justify-between gap-1">
              <div className="flex h-8 w-8 sm:h-10 sm:w-10 shrink-0 items-center justify-center rounded-lg sm:rounded-xl bg-cyan-500/10 text-cyan-600 transition-colors group-hover:bg-amber-500 group-hover:text-slate-950">
                <ScanSearch className="h-4 w-4 sm:h-5 sm:w-5" />
              </div>
              <span className="inline-flex items-center gap-1 rounded-full border border-cyan-200/60 bg-cyan-50 px-1.5 py-0.5 sm:px-2.5 sm:py-0.5 text-[9px] sm:text-xs font-semibold text-cyan-800 truncate max-w-[95px] sm:max-w-none">
                <CheckCircle2 className="h-2.5 w-2.5 sm:h-3 sm:w-3 shrink-0" /> Chassis Lookup
              </span>
            </div>

            <div className="mt-3 sm:mt-4">
              <h2 className="text-xs sm:text-base font-bold text-slate-950 transition-colors group-hover:text-amber-600 line-clamp-2 leading-snug">
                Chassis to RC Details
              </h2>
            </div>
          </div>

          <div className="mt-4 flex items-center justify-between border-t border-slate-100/90 pt-3">
            <ApiServicePrice summary={billing.summary} serviceKey="CHASSIS_TO_RC" />
            <ArrowRight className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-slate-400 group-hover:text-amber-600 transition-transform group-hover:translate-x-1 shrink-0" />
          </div>
        </div>
        )}

        {/* Card 5: RC to Mobile Verification */}
        {canAccessRcToMobile && (
        <div
          onClick={() => setService('rc-to-mobile')}
          className="group relative cursor-pointer overflow-hidden rounded-xl sm:rounded-2xl border border-slate-200 bg-white p-3.5 sm:p-5 shadow-sm transition-all duration-300 hover:-translate-y-1 hover:border-amber-500 hover:shadow-md flex flex-col justify-between"
        >
          <div>
            <div className="flex items-center justify-between gap-1">
              <div className="flex h-8 w-8 sm:h-10 sm:w-10 shrink-0 items-center justify-center rounded-lg sm:rounded-xl bg-emerald-500/10 text-emerald-600 transition-colors group-hover:bg-amber-500 group-hover:text-slate-950">
                <Phone className="h-4 w-4 sm:h-5 sm:w-5" />
              </div>
              <span className="inline-flex items-center gap-1 rounded-full border border-emerald-200/60 bg-emerald-50 px-1.5 py-0.5 sm:px-2.5 sm:py-0.5 text-[9px] sm:text-xs font-semibold text-emerald-800 truncate max-w-[95px] sm:max-w-none">
                <CheckCircle2 className="h-2.5 w-2.5 sm:h-3 sm:w-3 shrink-0" /> Contact Lookup
              </span>
            </div>

            <div className="mt-3 sm:mt-4">
              <h2 className="text-xs sm:text-base font-bold text-slate-950 transition-colors group-hover:text-amber-600 line-clamp-2 leading-snug">
                RC to Mobile
              </h2>
            </div>
          </div>

          <div className="mt-4 flex items-center justify-between border-t border-slate-100/90 pt-3">
            <ApiServicePrice summary={billing.summary} serviceKey="RC_TO_MOBILE" />
            <ArrowRight className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-slate-400 group-hover:text-amber-600 transition-transform group-hover:translate-x-1 shrink-0" />
          </div>
        </div>
        )}

        {/* Card 6: Mobile To RC */}
        {canAccessMobileToRc && (
        <div
          onClick={() => setService('mobile-to-rc')}
          className="group relative cursor-pointer overflow-hidden rounded-xl sm:rounded-2xl border border-slate-200 bg-white p-3.5 sm:p-5 shadow-sm transition-all duration-300 hover:-translate-y-1 hover:border-amber-500 hover:shadow-md flex flex-col justify-between"
        >
          <div>
            <div className="flex items-center justify-between gap-1">
              <div className="flex h-8 w-8 sm:h-10 sm:w-10 shrink-0 items-center justify-center rounded-lg sm:rounded-xl bg-violet-500/10 text-violet-600 transition-colors group-hover:bg-amber-500 group-hover:text-slate-950">
                <ListChecks className="h-4 w-4 sm:h-5 sm:w-5" />
              </div>
              <span className="inline-flex items-center gap-1 rounded-full border border-violet-200/60 bg-violet-50 px-1.5 py-0.5 sm:px-2.5 sm:py-0.5 text-[9px] sm:text-xs font-semibold text-violet-800 truncate max-w-[95px] sm:max-w-none">
                <CheckCircle2 className="h-2.5 w-2.5 sm:h-3 sm:w-3 shrink-0" /> RC Lookup
              </span>
            </div>

            <div className="mt-3 sm:mt-4">
              <h2 className="text-xs sm:text-base font-bold text-slate-950 transition-colors group-hover:text-amber-600 line-clamp-2 leading-snug">
                Mobile To RC
              </h2>
            </div>
          </div>

          <div className="mt-4 flex items-center justify-between border-t border-slate-100/90 pt-3">
            <ApiServicePrice summary={billing.summary} serviceKey="MOBILE_TO_RC" />
            <ArrowRight className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-slate-400 group-hover:text-amber-600 transition-transform group-hover:translate-x-1 shrink-0" />
          </div>
        </div>
        )}

        {/* Card 7: RC Mobile Number Check */}
        {canAccessRcMobileNumberCheck && (
        <div
          onClick={() => setService('rc-mobile-number-check')}
          className="group relative cursor-pointer overflow-hidden rounded-xl sm:rounded-2xl border border-slate-200 bg-white p-3.5 sm:p-5 shadow-sm transition-all duration-300 hover:-translate-y-1 hover:border-amber-500 hover:shadow-md flex flex-col justify-between"
        >
          <div>
            <div className="flex items-center justify-between gap-1">
              <div className="flex h-8 w-8 sm:h-10 sm:w-10 shrink-0 items-center justify-center rounded-lg sm:rounded-xl bg-orange-500/10 text-orange-600 transition-colors group-hover:bg-amber-500 group-hover:text-slate-950">
                <Phone className="h-4 w-4 sm:h-5 sm:w-5" />
              </div>
              <span className="inline-flex items-center gap-1 rounded-full border border-orange-200/60 bg-orange-50 px-1.5 py-0.5 sm:px-2.5 sm:py-0.5 text-[9px] sm:text-xs font-semibold text-orange-800 truncate max-w-[95px] sm:max-w-none">
                <CheckCircle2 className="h-2.5 w-2.5 sm:h-3 sm:w-3 shrink-0" /> Mobile Match
              </span>
            </div>

            <div className="mt-3 sm:mt-4">
              <h2 className="text-xs sm:text-base font-bold text-slate-950 transition-colors group-hover:text-amber-600 line-clamp-2 leading-snug">
                RC Mobile Number Check
              </h2>
            </div>
          </div>

          <div className="mt-4 flex items-center justify-between border-t border-slate-100/90 pt-3">
            <ApiServicePrice summary={billing.summary} serviceKey="RC_MOBILE_NUMBER_CHECK" />
            <ArrowRight className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-slate-400 group-hover:text-amber-600 transition-transform group-hover:translate-x-1 shrink-0" />
          </div>
        </div>
        )}
      </div>

      {/* Empty State */}
      {!canAccessDrivingLicense && !canAccessRcOwnerHistory && !canAccessRcFull && !canAccessRcChallan && !canAccessChassisToRc && !canAccessRcToMobile && !canAccessMobileToRc && !canAccessRcMobileNumberCheck && (
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
