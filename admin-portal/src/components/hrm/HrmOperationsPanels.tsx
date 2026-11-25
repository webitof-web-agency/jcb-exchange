'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { BriefcaseBusiness, ChevronRight, CircleCheck, ClipboardList, TriangleAlert } from 'lucide-react';
import { hrmApi, type HrmOnboardingCase, type HrmOrgUnit, type HrmPayrollReadiness } from '@/lib/hrmApi';
import { formatHrmDate, formatHrmStatus, hasHrmPermission } from '@/lib/hrmUi';
import { HRM_NO_ACCESS_MESSAGE, isHrmForbidden } from '@/lib/hrmAccess';
import { useAuthStore } from '@/store/authStore';

/**
 * Finance Hub payroll hand-off, the recruitment onboarding queue and a read-only view of the organisation units.
 * Units themselves (departments, head office, state offices) are managed on the Organisation page only.
 * Each block is shown (and requested) only with the permission its endpoint needs, so nobody sees an empty card that
 * really means "no access"; a 403 that still comes back is shown as "no access", never as "nothing here".
 * Shared by the employee directory and the HRM section workspaces.
 */
export default function HrmOperationsPanels({ portal }: { portal: 'admin' | 'employee' }) {
  const [onboarding, setOnboarding] = useState<HrmOnboardingCase[]>([]);
  const [orgUnits, setOrgUnits] = useState<HrmOrgUnit[]>([]);
  const [payrollReadiness, setPayrollReadiness] = useState<HrmPayrollReadiness | null>(null);
  const [denied, setDenied] = useState({ onboarding: false, orgUnits: false });
  const { user } = useAuthStore();
  const isSuperAdmin = user?.role === 'SUPER_ADMIN';
  // GET /hrm/onboarding needs hrm.onboarding.read; the Onboarding page also opens with .manage.
  const canReadQueue = hasHrmPermission(user?.permissions, ['hrm.onboarding.read'], isSuperAdmin);
  const canOpenOnboarding = hasHrmPermission(user?.permissions, ['hrm.onboarding.read', 'hrm.onboarding.manage'], isSuperAdmin);
  // GET /hrm/org-units and the Organisation page need hrm.org.read.
  const canReadOrg = hasHrmPermission(user?.permissions, ['hrm.org.read'], isSuperAdmin);
  // Payroll readiness needs hrm.compensation.read and Finance payroll read (Finance treats the ADMIN role as all-access).
  const canReadPayroll = isSuperAdmin || (
    hasHrmPermission(user?.permissions, ['hrm.compensation.read'])
    && (user?.role === 'ADMIN' || hasHrmPermission(user?.permissions, ['fh.payroll.read']))
  );

  const load = useCallback(async () => {
    const skip = Promise.resolve(null);
    const [onboardingResult, orgUnitsResult, payrollResult] = await Promise.allSettled([
      canReadQueue ? hrmApi.listOnboarding() : skip,
      canReadOrg ? hrmApi.listOrgUnits() : skip,
      canReadPayroll ? hrmApi.getPayrollReadiness() : skip,
    ]);
    setDenied({
      onboarding: onboardingResult.status === 'rejected' && isHrmForbidden(onboardingResult.reason),
      orgUnits: orgUnitsResult.status === 'rejected' && isHrmForbidden(orgUnitsResult.reason),
    });
    if (onboardingResult.status === 'fulfilled' && onboardingResult.value) setOnboarding(onboardingResult.value.data.onboarding || []);
    if (orgUnitsResult.status === 'fulfilled' && orgUnitsResult.value) setOrgUnits(orgUnitsResult.value.data.orgUnits || []);
    if (payrollResult.status === 'fulfilled' && payrollResult.value) setPayrollReadiness(payrollResult.value.data.payrollReadiness);
  }, [canReadOrg, canReadPayroll, canReadQueue]);

  useEffect(() => {
    const timer = window.setTimeout(() => { void load(); }, 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  return (
    <>
      {payrollReadiness ? (
        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-amber-600">Finance Hub handoff</p>
              <h2 className="mt-1 font-bold text-slate-950">Payroll readiness</h2>
              <p className="mt-1 text-sm text-slate-500">Read-only check between approved HRM compensation and existing Finance Hub payroll profiles.</p>
            </div>
            <div className="flex gap-2 text-xs font-semibold">
              <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-1 text-emerald-700"><CircleCheck className="h-3.5 w-3.5" />{payrollReadiness.summary.ready} ready</span>
              <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2.5 py-1 text-amber-700"><TriangleAlert className="h-3.5 w-3.5" />{payrollReadiness.summary.blocked} blocked</span>
            </div>
          </div>
          {payrollReadiness.summary.blocked ? (
            <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {payrollReadiness.items.filter((item) => item.readiness === 'BLOCKED').slice(0, 6).map((item) => (
                <Link key={item.employeeId} href={`/${portal}/hrm/${item.employeeId}`} className="rounded-xl border border-amber-100 bg-amber-50/50 p-3 hover:bg-amber-50">
                  <p className="text-sm font-semibold text-slate-800">{item.employeeCode} · {item.legalName}</p>
                  <p className="mt-1 text-xs text-amber-700">{item.blockers.map(formatHrmStatus).join(' · ')}</p>
                </Link>
              ))}
            </div>
          ) : (
            <p className="mt-4 text-sm text-emerald-700">All accessible active employees are ready for the existing Finance Hub payroll boundary.</p>
          )}
        </section>
      ) : null}

      {canReadQueue || canReadOrg ? (
        <section className="grid gap-5 lg:grid-cols-2">
          {canReadQueue ? (
            <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-amber-600">Recruitment handoff</p>
                  <h2 className="mt-1 font-bold text-slate-950">Onboarding queue</h2>
                </div>
                <ClipboardList className="h-5 w-5 text-amber-500" />
              </div>
              {onboarding.length ? (
                <div className="mt-4 space-y-2">
                  {onboarding.slice(0, 5).map((item) => (
                    <Link key={item.id} href={item.employeeId ? `/${portal}/hrm/${item.employeeId}` : `/${portal}/hrm`} className="flex items-center justify-between rounded-xl border border-slate-100 px-3 py-3 hover:bg-slate-50">
                      <div>
                        <p className="text-sm font-semibold text-slate-800">{item.employeeId ? 'Employee onboarding' : 'Pending employee creation'}</p>
                        <p className="mt-1 text-xs text-slate-500">{item.offerId || 'Direct HR'} · Joining {formatHrmDate(item.targetJoiningDate)}</p>
                      </div>
                      <span className="text-xs font-semibold text-amber-700">{formatHrmStatus(item.status)}</span>
                    </Link>
                  ))}
                </div>
              ) : <p className="mt-4 text-sm text-slate-500">{denied.onboarding ? HRM_NO_ACCESS_MESSAGE : 'No onboarding cases are waiting.'}</p>}
              <p className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 pt-4 text-xs text-slate-500">
                <span>Joining dates, checklists and cases that need a decision.</span>
                {canOpenOnboarding ? <Link href={`/${portal}/hrm/onboarding`} className="inline-flex items-center gap-0.5 font-semibold text-amber-700 hover:underline">View all<ChevronRight className="h-3.5 w-3.5" /></Link> : null}
              </p>
            </div>
          ) : null}

          {canReadOrg ? (
            <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-amber-600">Organisation model</p>
                  <h2 className="mt-1 font-bold text-slate-950">Units and reporting structure</h2>
                </div>
                <BriefcaseBusiness className="h-5 w-5 text-amber-500" />
              </div>
              {orgUnits.length ? (
                <div className="mt-4 flex flex-wrap gap-2">
                  {orgUnits.slice(0, 12).map((unit) => (
                    <span key={unit.id} className="rounded-full bg-slate-100 px-3 py-1.5 text-xs font-semibold text-slate-700">{unit.name} <span className="font-normal text-slate-400">· {unit.type}</span></span>
                  ))}
                </div>
              ) : <p className="mt-4 text-sm text-slate-500">{denied.orgUnits ? HRM_NO_ACCESS_MESSAGE : 'No organisation units have been configured.'}</p>}
              {!denied.orgUnits ? (
                <p className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 pt-4 text-xs text-slate-500">
                  <span>Departments, head office and state offices are managed on the Organisation page.</span>
                  <Link href={`/${portal}/hrm/organisation`} className="inline-flex items-center gap-0.5 font-semibold text-amber-700 hover:underline">Open Organisation<ChevronRight className="h-3.5 w-3.5" /></Link>
                </p>
              ) : null}
            </div>
          ) : null}
        </section>
      ) : null}
    </>
  );
}
