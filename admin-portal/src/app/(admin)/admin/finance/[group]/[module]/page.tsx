'use client';

import Link from 'next/link';
import type { ReactNode } from 'react';
import { useParams, usePathname } from 'next/navigation';
import { LockKeyhole, SearchX } from 'lucide-react';
import { useAuthStore } from '@/store/authStore';
import { financeDashboardPath, financeModulePath, financePortalPrefix, getVisibleFinanceWorkspaceGroups, matchFinanceModulePath } from '@/lib/financeWorkspace';
import FinancePageHeader from '@/components/financeWorkspace/FinancePageHeader';
import { financeWorkspaceScreens } from '@/components/financeWorkspace/moduleRegistry';

function Notice({ icon, title, description, prefix }: { icon: ReactNode; title: string; description: string; prefix: string }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-8 text-center">
      <div className="mx-auto flex justify-center text-slate-300">{icon}</div>
      <h1 className="mt-3 text-[15px] font-semibold text-slate-900">{title}</h1>
      <p className="mx-auto mt-1 max-w-md text-[13px] leading-5 text-slate-500">{description}</p>
      <Link href={financeDashboardPath(prefix)} className="mt-4 inline-flex h-8 items-center rounded-lg bg-amber-400 px-3 text-[13px] font-semibold text-slate-950 hover:bg-amber-300">Finance dashboard</Link>
    </div>
  );
}

/** One Finance & Accounts module on its own page: /{portal}/finance/{group}/{module}. */
export default function FinanceModulePage() {
  const pathname = usePathname();
  const params = useParams<{ group: string; module: string }>();
  const prefix = financePortalPrefix(pathname);
  const user = useAuthStore((state) => state.user);
  const hasFullAccess = user?.role === 'SUPER_ADMIN' || user?.role === 'ADMIN';
  const match = matchFinanceModulePath(`${prefix}/finance/${params.group}/${params.module}`);
  const groupKey = match?.group.key;
  const allowed = Boolean(groupKey && getVisibleFinanceWorkspaceGroups(user?.permissions, hasFullAccess).some((group) => group.key === groupKey));

  if (!match) {
    return <Notice prefix={prefix} icon={<SearchX className="h-9 w-9" />} title="Page not found" description="This finance page does not exist. Pick a page from the Finance & Accounts menu." />;
  }
  if (!allowed) {
    return <Notice prefix={prefix} icon={<LockKeyhole className="h-9 w-9" />} title="No access to this page" description={`Ask a super admin to give your role a ${match.group.label} permission in Users → Roles.`} />;
  }

  const Screen = financeWorkspaceScreens[match.module.key];
  return (
    <div className="space-y-3">
      <FinancePageHeader page={{ href: financeModulePath(prefix, match.module.key), label: match.module.label, group: match.group.label }} />
      <div className="tabular-nums">
        {Screen ? <Screen /> : (
          <Notice prefix={prefix} icon={<SearchX className="h-9 w-9" />} title="Not available yet" description="This page has not been built yet." />
        )}
      </div>
    </div>
  );
}
