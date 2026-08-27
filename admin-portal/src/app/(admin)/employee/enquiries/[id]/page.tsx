import LeadDetailPage from '@/components/portal/LeadDetailPage';

export default async function EmployeeLeadDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <LeadDetailPage leadId={id} />;
}
