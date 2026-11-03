'use client';

import { useEffect, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/store/authStore';

// Aadhaar / PAN / RC card template previews. They render documents that look real, so only a
// super admin can open them, and every screen and printout carries a SAMPLE watermark.
export default function DocumentTemplatesLayout({ children }: { children: ReactNode }) {
  const router = useRouter();
  const { user, hasHydrated } = useAuthStore();
  const isSuperAdmin = user?.role === 'SUPER_ADMIN';

  useEffect(() => {
    if (hasHydrated && user && !isSuperAdmin) router.replace('/employee/dashboard');
  }, [hasHydrated, isSuperAdmin, router, user]);

  if (!isSuperAdmin) return null;

  return (
    <div className="relative">
      {children}
      <div
        aria-hidden="true"
        className="pointer-events-none fixed inset-0 z-[60] flex select-none flex-wrap content-around justify-around overflow-hidden opacity-25 print:opacity-40"
      >
        {Array.from({ length: 12 }, (_, index) => (
          <span key={index} className="-rotate-30 whitespace-nowrap text-3xl font-black uppercase tracking-widest text-red-600">
            Sample · Not a valid document
          </span>
        ))}
      </div>
    </div>
  );
}
