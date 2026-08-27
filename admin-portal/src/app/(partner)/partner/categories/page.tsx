'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function PartnerCategoriesRedirectPage() {
  const router = useRouter();

  useEffect(() => {
    router.replace('/partner/listings');
  }, [router]);

  return null;
}
