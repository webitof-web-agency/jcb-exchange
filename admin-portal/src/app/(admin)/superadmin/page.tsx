'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function SuperAdminIndexPage() {
  const router = useRouter();

  useEffect(() => {
    router.replace('/superadmin/dashboard');
  }, [router]);

  return (
    <div className="flex min-h-[240px] items-center justify-center rounded-2xl border border-gray-200 bg-white text-sm text-gray-500">
      Redirecting to super admin dashboard...
    </div>
  );
}
