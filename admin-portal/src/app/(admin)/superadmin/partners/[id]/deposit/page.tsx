'use client';

import { useEffect } from 'react';
import { useParams, usePathname, useRouter } from 'next/navigation';
import api from '@/lib/api';
import { resolvePartnerId } from '@/lib/routeResolvers';
import { generateAdminPartnerDetailPath } from '@/lib/routePaths';

type RedirectPartnerRecord = {
  id: string;
  name?: string | null;
  partnerProfile?: {
    businessName?: string | null;
    district?: string | null;
  } | null;
};

export default function SuperadminPartnerDepositPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const pathname = usePathname();
  const routeBase = pathname.startsWith('/employee') ? '/employee/partners' : '/superadmin/partners';

  useEffect(() => {
    if (!params?.id) {
      return;
    }

    let cancelled = false;

    const redirectToPartnerDetail = async () => {
      const genericFallbackPath = generateAdminPartnerDetailPath(routeBase, {
        id: params.id,
        name: 'partner',
        businessName: 'partner',
        district: '',
      });

      try {
        const resolvedPartnerId = (await resolvePartnerId(params.id)) || params.id;
        const response = await api.get<{ partners: RedirectPartnerRecord[] }>('/superadmin/partners');
        const partner = response.data.partners.find((item) => item.id === resolvedPartnerId);

        if (cancelled) {
          return;
        }

        if (partner) {
          router.replace(
            generateAdminPartnerDetailPath(routeBase, {
              id: partner.id,
              name: partner.name,
              businessName: partner.partnerProfile?.businessName || partner.name,
              district: partner.partnerProfile?.district || '',
            })
          );
          return;
        }
      } catch (error) {
        console.error('Failed to normalize partner deposit route:', error);
      }

      if (!cancelled) {
        router.replace(genericFallbackPath);
      }
    };

    void redirectToPartnerDetail();

    return () => {
      cancelled = true;
    };
  }, [params?.id, routeBase, router]);

  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-6 text-sm text-gray-600 shadow-sm">
      Redirecting to partner onboarding...
    </div>
  );
}
