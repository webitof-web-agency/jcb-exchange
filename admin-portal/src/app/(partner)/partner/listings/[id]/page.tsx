import ListingDetailPage from '@/components/portal/ListingDetailPage';

export default async function PartnerListingDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <ListingDetailPage listingId={id} />;
}
