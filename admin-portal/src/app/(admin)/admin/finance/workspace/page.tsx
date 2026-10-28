'use client';

import { useEffect } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { financeModulePath, financePortalPrefix } from '@/lib/financeWorkspace';
import FinanceDashboard from '@/components/financeWorkspace/FinanceDashboard';
import { LoadingState } from '@/components/financeWorkspace/ui';

/** Finance dashboard. Old `?module=<key>` links redirect to that module's own page, keeping other params. */
export default function FinanceWorkspacePage() {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const legacyModule = searchParams.get('module');

  useEffect(() => {
    if (!legacyModule) return;
    const rest = Object.fromEntries(Array.from(searchParams.entries()).filter(([key]) => key !== 'module'));
    router.replace(financeModulePath(financePortalPrefix(pathname), legacyModule, rest));
  }, [legacyModule, pathname, router, searchParams]);

  return legacyModule ? <LoadingState /> : <FinanceDashboard />;
}
