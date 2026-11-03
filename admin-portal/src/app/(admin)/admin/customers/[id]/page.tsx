import CrmContactDetail from '@/components/crm/CrmContactDetail';

export default async function AdminCustomerDetailsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <CrmContactDetail contactId={id} backHref="/admin/customers" />;
}
