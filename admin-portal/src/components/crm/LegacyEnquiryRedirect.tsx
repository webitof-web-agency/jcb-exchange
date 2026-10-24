'use client';

import { useEffect } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { CrmLoadingState } from './crmShared';
import { resolveLeadId } from '@/lib/routeResolvers';

/** Old enquiry links (slug + short id) → the CRM lead page. Enquiries now live in the CRM. */
export default function LegacyEnquiryRedirect({ param }: { param?: string }) {
  const router = useRouter();
  const pathname = usePathname() || '';
  useEffect(() => {
    const prefix = pathname.startsWith('/employee') ? '/employee' : '/admin';
    if (!param) {
      router.replace(`${prefix}/crm/leads`);
      return;
    }
    let cancelled = false;
    void resolveLeadId(param).then((id) => {
      if (!cancelled) router.replace(id ? `${prefix}/crm/leads/${id}` : `${prefix}/crm/leads`);
    });
    return () => { cancelled = true; };
  }, [param, pathname, router]);
  return <CrmLoadingState label="Opening in CRM…" />;
}
