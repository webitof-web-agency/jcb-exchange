import PartnerDetailPage from '@/components/portal/PartnerDetailPage';

export default async function EmployeePartnerDetails({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  return (
    <PartnerDetailPage
      partnerId={id}
      backHref="/employee/partners"
      editBaseHref="/employee/partners"
      listingDetailBaseHref="/employee/listings"
    />
  );
}
