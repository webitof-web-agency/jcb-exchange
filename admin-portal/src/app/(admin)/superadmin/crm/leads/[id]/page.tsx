import CrmLeadDetail from '@/components/crm/CrmLeadDetail';

export default async function CrmLeadPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <CrmLeadDetail leadId={id} />;
}
