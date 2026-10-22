import PartnerDetailPage from '@/components/portal/PartnerDetailPage';

export default async function SuperAdminPartnerDetails({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  return (
    <PartnerDetailPage
      partnerId={id}
      backHref="/admin/partners"
      editBaseHref="/admin/partners"
      listingDetailBaseHref="/admin/listings"
    />
  );
}
