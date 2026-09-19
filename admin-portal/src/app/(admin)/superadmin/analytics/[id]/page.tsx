import { Suspense } from 'react';
import type { Metadata } from 'next';
import AnalyticsListingDetail from '@/components/analytics/AnalyticsListingDetail';
import BrandLoader from '@/components/ui/BrandLoader';

const noIndexRobots: Metadata['robots'] = {
  index: false,
  follow: false,
  googleBot: {
    index: false,
    follow: false,
    noimageindex: true,
  },
};

export async function generateMetadata(): Promise<Metadata> {
  return {
    title: 'Listing Analytics Detail | JCB Exchange Portal',
    description:
      'Detailed analytics for a single machine listing: views, tracked views, lead pipeline, conversion rate, lead status breakdown, sale record, and performance metrics.',
    robots: noIndexRobots,
  };
}

export default async function SuperAdminAnalyticsListingDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  return (
    <Suspense fallback={<BrandLoader variant="section" size="md" bg="light" text="Loading listing analytics..." className="rounded-2xl border border-slate-200 bg-white p-10 shadow-xs" />}>
      <AnalyticsListingDetail
        listingId={id}
        backHref="/superadmin/analytics"
      />
    </Suspense>
  );
}
