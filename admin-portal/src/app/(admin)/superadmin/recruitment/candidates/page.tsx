'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function AdminCandidatesPage() {
  const router = useRouter();

  useEffect(() => {
    router.replace('/superadmin/recruitment/applications');
  }, [router]);

  return null;
}
