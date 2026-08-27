'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function PartnerDepositsPage() {
  const router = useRouter();

  useEffect(() => {
    router.replace('/partner/kyc');
  }, [router]);

  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-6 text-sm text-gray-600 shadow-sm">
      Redirecting to onboarding...
    </div>
  );
}
