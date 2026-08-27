import VisitorDetailPage from '@/components/portal/VisitorDetailPage';

export default async function EmployeeVisitorDetailsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  return (
    <VisitorDetailPage
      visitorId={id}
      backHref="/employee/visitors"
      listingDetailBaseHref="/employee/listings"
    />
  );
}
