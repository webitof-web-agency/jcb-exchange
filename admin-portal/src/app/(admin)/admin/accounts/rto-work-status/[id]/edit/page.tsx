'use client';

import { Suspense, useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import BrandLoader from '@/components/ui/BrandLoader';
import RtoWorkspace from '@/components/accounts/rto/RtoWorkspace';
import api from '@/lib/api';

export default function RtoTransferWorkspacePage() {
  const params = useParams();
  const rawId = decodeURIComponent(String(params?.id || ''));
  const [resolvedRecordId, setResolvedRecordId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    const resolve = async () => {
      if (!rawId) {
        setLoading(false);
        return;
      }
      const cleanParam = rawId.toUpperCase().replace(/[^A-Z0-9]/g, '');
      try {
        const response = await api.get<{ records?: Array<{ id: string; vehicleNumber?: string }> }>('/recruitment/admin/rto-records');
        const records = response.data?.records || [];
        const found = records.find((item) => {
          if (item.id.toLowerCase() === rawId.toLowerCase()) return true;
          const cleanItem = String(item.vehicleNumber || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
          return Boolean(cleanItem && cleanItem === cleanParam);
        });
        if (active) {
          setResolvedRecordId(found ? found.id : rawId);
        }
      } catch {
        if (active) setResolvedRecordId(rawId);
      } finally {
        if (active) setLoading(false);
      }
    };
    void resolve();
    return () => { active = false; };
  }, [rawId]);

  if (loading) {
    return <BrandLoader variant="section" size="sm" bg="light" text="Loading RTO Workspace..." />;
  }

  const effectiveId = resolvedRecordId || rawId;

  return (
    <Suspense fallback={<BrandLoader variant="section" size="sm" bg="light" text="Loading..." />}>
      <RtoWorkspace key={effectiveId} recordId={effectiveId} />
    </Suspense>
  );
}
