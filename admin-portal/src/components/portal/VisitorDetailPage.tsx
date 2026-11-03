'use client';

import CrmContactDetail from '@/components/crm/CrmContactDetail';

/** Visitors and registered customers share the same CRM-powered 360° dossier. */
export default function VisitorDetailPage({ visitorId, backHref }: { visitorId: string; backHref: string; listingDetailBaseHref?: string }) {
  return <CrmContactDetail contactId={visitorId} backHref={backHref} />;
}
