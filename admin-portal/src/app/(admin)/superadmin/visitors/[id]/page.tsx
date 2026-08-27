import VisitorDetailPage from '@/components/portal/VisitorDetailPage';

export default async function SuperAdminVisitorDetailsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  return (
    <VisitorDetailPage 
      visitorId={id} 
      backHref="/superadmin/visitors" 
      listingDetailBaseHref="/superadmin/listings"
    />
  );
}
