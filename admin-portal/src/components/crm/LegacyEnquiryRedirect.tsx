'use client';

import { useEffect } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { LoadingState } from '@/components/financeWorkspace/ui';
import { resolveLeadId } from '@/lib/routeResolvers';

/** Old enquiry links (slug + short id) → the CRM lead page. Enquiries now live in the CRM. */
export default function LegacyEnquiryRedirect({ param }: { param?: string }) {
  const router = useRouter();
  const pathname = usePathname() || '';
  useEffect(() => {
    const prefix = pathname.startsWith('/employee') ? '/employee' : pathname.startsWith('/admin') ? '/admin' : '/superadmin';
    if (!param) {
      router.replace(`${prefix}/crm?tab=leads`);
      return;
    }
    let cancelled = false;
    void resolveLeadId(param).then((id) => {
      if (!cancelled) router.replace(id ? `${prefix}/crm/leads/${id}` : `${prefix}/crm?tab=leads`);
    });
    return () => { cancelled = true; };
  }, [param, pathname, router]);
  return <LoadingState label="Opening in CRM…" />;
}
