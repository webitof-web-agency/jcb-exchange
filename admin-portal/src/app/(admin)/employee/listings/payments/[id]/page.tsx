import type { Metadata } from 'next';
import ListingPaymentDetailPage from '@/components/admin/ListingPaymentDetailPage';

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
    title: 'Payment Verification Detail | JCB Exchange Portal',
    description:
      'Review listing payment proof, buyer information, partner details, amount, UTR, notes, and verification status in the JCB Exchange portal.',
    robots: noIndexRobots,
  };
}

export default async function EmployeeListingPaymentDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <ListingPaymentDetailPage paymentId={id} backHref="/employee/listings" />;
}
