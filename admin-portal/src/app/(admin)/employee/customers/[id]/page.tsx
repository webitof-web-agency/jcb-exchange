import CrmContactDetail from '@/components/crm/CrmContactDetail';

export default async function EmployeeCustomerDetailsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <CrmContactDetail contactId={id} backHref="/employee/customers" />;
}
