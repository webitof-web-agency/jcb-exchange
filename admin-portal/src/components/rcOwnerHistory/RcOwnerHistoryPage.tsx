'use client';

import RcLookupPage from '@/components/rcLookup/RcLookupPage';

export default function RcOwnerHistoryPage({ embedded = false }: { embedded?: boolean } = {}) {
  return <RcLookupPage embedded={embedded} variant="owner-history" />;
}
