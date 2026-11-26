'use client';

import Link from 'next/link';
import { LockKeyhole, WalletCards } from 'lucide-react';
import { financeWorkspaceScreens } from '@/components/financeWorkspace/moduleRegistry';
import { useAuthStore } from '@/store/authStore';
import { hasAnyPermission } from '@/lib/permissionUtils';
import { getHrmPayrollPath, HRM_PAYROLL_MODULES, isHrmPayrollModuleKey, type HrmPayrollModuleKey } from '@/lib/hrmNavigation';

type HrmPayrollWorkspaceProps = { portal: 'admin' | 'employee'; module?: string };

export default function HrmPayrollWorkspace({ portal, module = 'employee-salary' }: HrmPayrollWorkspaceProps) {
  const user = useAuthStore((state) => state.user);
  const isFinancePayrollUser = user?.role === 'SUPER_ADMIN' || user?.role === 'ADMIN' || hasAnyPermission(user?.permissions, ['fh.payroll.read', 'fh.payroll.manage']);
  const selected: HrmPayrollModuleKey = isHrmPayrollModuleKey(module) ? module : 'employee-salary';
  const Screen = financeWorkspaceScreens[selected];

  if (!isFinancePayrollUser) {
    return <main className="w-full"><section className="mx-auto max-w-3xl rounded-2xl border border-amber-200 bg-amber-50 p-6 text-center shadow-sm"><LockKeyhole className="mx-auto h-7 w-7 text-amber-700" /><h1 className="mt-3 text-lg font-bold text-slate-950">Payroll access is restricted</h1><p className="mt-2 text-sm text-slate-600">Payroll is shared with Finance Hub. Ask an administrator for Finance Payroll read or manage permission.</p></section></main>;
  }

  return <main className="w-full space-y-4"><header className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><div className="flex items-start gap-3"><div className="rounded-xl bg-amber-100 p-3 text-amber-700"><WalletCards className="h-6 w-6" /></div><div><p className="text-xs font-semibold uppercase tracking-[0.18em] text-amber-600">HRM · Shared Finance Data</p><h1 className="mt-1 text-2xl font-bold text-slate-950">Payroll</h1><p className="mt-1 text-sm text-slate-500">The same controlled payroll records used in Finance Hub—no duplicate salary, payslip or settlement data.</p></div></div></header><nav aria-label="Payroll modules" className="flex gap-1 overflow-x-auto rounded-xl border border-slate-200 bg-white p-1 shadow-sm">{HRM_PAYROLL_MODULES.map((item) => <Link key={item.key} href={getHrmPayrollPath(portal, item.key)} className={`whitespace-nowrap rounded-lg px-3 py-2 text-xs font-semibold transition ${item.key === selected ? 'bg-slate-950 text-white' : 'text-slate-600 hover:bg-slate-100'}`}>{item.label}</Link>)}</nav><section className="tabular-nums">{Screen ? <Screen /> : null}</section></main>;
}
