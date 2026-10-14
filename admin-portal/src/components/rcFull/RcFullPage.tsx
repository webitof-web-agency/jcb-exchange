'use client';

import RcLookupPage from '@/components/rcLookup/RcLookupPage';

export default function RcFullPage({ embedded = false }: { embedded?: boolean } = {}) {
  return <RcLookupPage embedded={embedded} variant="full" />;
}
